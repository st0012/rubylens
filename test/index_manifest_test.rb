# frozen_string_literal: true

require_relative "test_helper"

class IndexManifestTest < Minitest::Test
  include SnapshotHelpers

  def test_builds_an_explicit_git_selected_workspace_manifest
    manifest = RubyLens::Index::Manifest.build(root: FIXTURE)
    relative = manifest.workspace_files.map { |path| Pathname(path).relative_path_from(FIXTURE).to_s }

    assert_equal(
      ["config.ru", "lib/domain.rb", "lib/reopen.rb", "sig/domain.rbs", "tasks/demo.rake", "test/order_test.rb"],
      relative,
    )
    assert_equal(:absent, manifest.boundaries.source)
    assert_empty(manifest.boundaries.groups)
    assert_nil(manifest.boundaries.ungrouped)
    assert_equal(manifest.workspace_files, manifest.files)
    assert_equal([], manifest.packages)
    assert_equal(["No Gemfile.lock found; dependency systems were omitted."], manifest.warnings)
    refute(manifest.files.any? { |path| path.end_with?("ignored.rb") })
  end

  def test_boundary_expansion_uses_only_git_selected_workspace_files
    Dir.mktmpdir("rubylens-monorepo-") do |directory|
      FileUtils.mkdir_p(File.join(directory, "apps", "tracked", "lib"))
      FileUtils.mkdir_p(File.join(directory, "apps", "ignored", "lib"))
      FileUtils.mkdir_p(File.join(directory, "apps", "untracked", "lib"))
      File.write(File.join(directory, "apps", "tracked", "lib", "tracked.rb"), "Tracked = true\n")
      File.write(File.join(directory, "apps", "ignored", "lib", "ignored.rb"), "Ignored = true\n")
      untracked = File.join(directory, "apps", "untracked", "lib", "untracked.rb")
      File.write(untracked, "Untracked = true\n")
      File.write(File.join(directory, ".gitignore"), "apps/ignored/\n")
      File.write(File.join(directory, ".rubylens.yml"), <<~YAML)
        version: 1
        boundaries:
          groups:
            - each: apps/*
              id_prefix: app
              label: "App · %{basename}"
      YAML
      system("git", "-C", directory, "init", "--quiet", exception: true)
      system("git", "-C", directory, "add", ".gitignore", ".rubylens.yml", "apps/tracked/lib/tracked.rb", exception: true)

      manifest = RubyLens::Index::Manifest.build(root: directory)

      assert_equal(["app-tracked", "ungrouped"], manifest.boundaries.groups.map(&:id))
      refute_includes(manifest.boundaries.groups.map(&:id), "app-ignored")
      refute_includes(manifest.boundaries.groups.map(&:id), "app-untracked")
      assert_includes(manifest.workspace_files, File.realpath(untracked))
      refute_includes(manifest.tracked_workspace_files, File.realpath(untracked))
    end
  end

  def test_absent_and_disabled_configuration_preserve_the_exact_snapshot_and_artifact
    absent_manifest = RubyLens::Index::Manifest.build(root: FIXTURE)
    disabled = RubyLens::Configuration.resolve(root: FIXTURE, disabled: true)
    disabled_manifest = RubyLens::Index::Manifest.build(root: FIXTURE, configuration: disabled)
    adapter = RubyLens::Index::RubydexAdapter.new

    absent_snapshot = adapter.index(absent_manifest)
    disabled_snapshot = adapter.index(disabled_manifest)

    assert_equal(absent_manifest.workspace_files, disabled_manifest.workspace_files)
    assert_equal(absent_snapshot, disabled_snapshot)
    assert_equal(JSON.generate(absent_snapshot), JSON.generate(disabled_snapshot))
    absent_art = RubyLens::ArtModelBuilder.new.build(absent_snapshot)
    disabled_art = RubyLens::ArtModelBuilder.new.build(disabled_snapshot)
    assert_equal(
      absent_art,
      disabled_art,
    )
    assert_equal(JSON.generate(absent_art), JSON.generate(disabled_art))
  end

  def test_excludes_rubylens_tool_only_dependency_closure
    manifest = RubyLens::Index::Manifest.build(root: ROOT)
    package_names = manifest.packages.map(&:name)

    assert_includes(package_names, "minitest")
    assert_includes(package_names, "rake")
    refute_includes(package_names, "rubylens")
    refute_includes(package_names, "rubydex")
    refute_includes(package_names, "base64")

    package_index = manifest.packages.index { |package| package.name == "minitest" }
    package = manifest.packages.fetch(package_index)
    assert_equal(package_index, manifest.package_index_for(package.files.first))
    assert_equal(package_index, manifest.package_index_for(package.root))
    assert_nil(manifest.package_index_for(manifest.workspace_files.first))
    assert_nil(manifest.package_index_for(ROOT.join("README.md")))
  end

  def test_detects_only_the_exact_locked_rails_spec_and_records_its_direct_shape
    dependency = Data.define(:name)
    specification = Data.define(:name, :version, :dependencies)
    parser = Struct.new(:specs).new([
      specification.new(name: "rubocop-rails", version: "2.0.0", dependencies: []),
      specification.new(
        name: "rails",
        version: "8.1.1",
        dependencies: [dependency.new(name: "railties"), dependency.new(name: "actionpack")],
      ),
    ])
    manifest = RubyLens::Index::Manifest.allocate

    manifest.send(:build_rails_reference, parser)

    assert_equal("8.1.1", manifest.rails_reference.version)
    assert_equal(%w[actionpack railties], manifest.rails_reference.members)
    assert_equal("full_family", manifest.rails_reference.scope)
  end

  def test_detects_an_exact_installed_rails_footprint_without_the_meta_gem
    specification = Data.define(:name, :version, :dependencies)
    members = %w[actionmailer actionpack actionview activejob activemodel activerecord activesupport railties]
    parser = Struct.new(:specs).new(members.map do |name|
      specification.new(name:, version: "8.0.5", dependencies: [])
    end)
    manifest = RubyLens::Index::Manifest.allocate

    manifest.send(:build_rails_reference, parser)

    assert_equal("8.0.5", manifest.rails_reference.version)
    assert_equal(members, manifest.rails_reference.members)
    assert_equal("installed_footprint", manifest.rails_reference.scope)
  end

  def test_does_not_infer_a_footprint_without_the_railties_base_or_with_split_versions
    specification = Data.define(:name, :version, :dependencies)
    base = %w[actionpack activesupport railties].map do |name|
      specification.new(name:, version: "8.0.5", dependencies: [])
    end

    missing_anchor = Struct.new(:specs).new(base.reject { |locked| locked.name == "actionpack" })
    manifest = RubyLens::Index::Manifest.allocate
    manifest.send(:build_rails_reference, missing_anchor)
    assert_nil(manifest.rails_reference)

    split_versions = Struct.new(:specs).new([
      *base,
      specification.new(name: "activerecord", version: "8.0.4", dependencies: []),
    ])
    manifest = RubyLens::Index::Manifest.allocate
    manifest.send(:build_rails_reference, split_versions)
    assert_nil(manifest.rails_reference)
  end

  def test_does_not_detect_rails_integrations_as_the_rails_meta_gem
    specification = Data.define(:name, :version, :dependencies)
    parser = Struct.new(:specs).new([
      specification.new(name: "rubocop-rails", version: "2.0.0", dependencies: []),
      specification.new(name: "vite_rails", version: "3.0.0", dependencies: []),
    ])
    manifest = RubyLens::Index::Manifest.allocate

    manifest.send(:build_rails_reference, parser)

    assert_nil(manifest.rails_reference)
  end

  def test_package_lookup_preserves_nested_root_priority_and_caches_fallbacks
    manifest = RubyLens::Index::Manifest.allocate
    manifest.instance_variable_set(:@package_roots, [[Pathname("/tmp/gems/nested"), 1], [Pathname("/tmp/gems"), 0]])
    manifest.instance_variable_set(
      :@package_index_by_file,
      { "/tmp/gems/exact.rb" => 0, "/tmp/workspace.rb" => nil },
    )
    manifest.instance_variable_set(:@package_index_cache, {})
    fallback_calls = 0
    manifest.define_singleton_method(:uncached_package_index_for) do |path|
      fallback_calls += 1
      super(path)
    end

    assert_equal(0, manifest.package_index_for("/tmp/gems/exact.rb"))
    assert_nil(manifest.package_index_for("/tmp/workspace.rb"))
    assert_equal(1, manifest.package_index_for("/tmp/gems/nested/lib/example.rb"))
    assert_equal(1, manifest.package_index_for("/tmp/gems/nested/lib/example.rb"))
    assert_nil(manifest.package_index_for("/tmp/elsewhere/example.rb"))
    assert_nil(manifest.package_index_for("/tmp/elsewhere/example.rb"))
    assert_equal(2, fallback_calls)
  end

  def test_package_lookup_preserves_package_ownership_for_workspace_overlap
    manifest = RubyLens::Index::Manifest.allocate
    outer_package = RubyLens::Index::Manifest::Package.new(
      name: "outer",
      version: "1.0.0",
      role: "direct",
      location: "external",
      root: Pathname("/tmp/example"),
      files: ["/tmp/example/nested/shared.rb", "/tmp/example/outer.rb"],
    )
    inner_package = RubyLens::Index::Manifest::Package.new(
      name: "inner",
      version: "1.0.0",
      role: "transitive",
      location: "external",
      root: Pathname("/tmp/example/nested"),
      files: ["/tmp/example/nested/shared.rb"],
    )
    manifest.instance_variable_set(:@workspace_files, ["/tmp/example/nested/shared.rb", "/tmp/workspace.rb"])
    manifest.instance_variable_set(:@packages, [outer_package, inner_package])
    manifest.instance_variable_set(:@package_roots, [[inner_package.root, 1], [outer_package.root, 0]])
    manifest.send(:build_package_index)

    assert_equal(1, manifest.package_index_for("/tmp/example/nested/shared.rb"))
    assert_equal(0, manifest.package_index_for("/tmp/example/outer.rb"))
    assert_nil(manifest.package_index_for("/tmp/workspace.rb"))
  end

  def test_package_lookup_resolves_a_symlink_to_an_audited_file
    Dir.mktmpdir("rubylens-package-lookup-") do |directory|
      root = Pathname(directory).join("gem")
      FileUtils.mkdir_p(root.join("lib"))
      audited_file = root.join("lib/example.rb")
      File.write(audited_file, "Example = 1\n")
      symlink = Pathname(directory).join("example.rb")
      File.symlink(audited_file, symlink)
      manifest = RubyLens::Index::Manifest.allocate
      manifest.instance_variable_set(:@package_roots, [])
      manifest.instance_variable_set(:@package_index_by_file, { audited_file.realpath.to_s => 2 })
      manifest.instance_variable_set(:@package_index_cache, {})

      assert_equal(2, manifest.package_index_for(symlink))
    end
  end

  def test_dependency_file_enumeration_rejects_symlinks_outside_the_gem_root
    Dir.mktmpdir("rubylens-manifest-gem-") do |directory|
      root = Pathname(directory).join("gem")
      external = Pathname(directory).join("private.rb")
      FileUtils.mkdir_p(root.join("lib"))
      File.write(external, "PrivateValue = 1\n")
      File.symlink(external, root.join("lib/leak.rb"))
      manifest = RubyLens::Index::Manifest.new(root: FIXTURE)

      files = manifest.send(:enumerate, root.join("lib/leak.rb"), root)

      assert_empty(files)
    end
  end
end
