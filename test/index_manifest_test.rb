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
    assert_equal(manifest.workspace_files, manifest.files)
    assert_equal([], manifest.packages)
    assert_equal(["No Gemfile.lock found; dependency systems were omitted."], manifest.warnings)
    refute(manifest.files.any? { |path| path.end_with?("ignored.rb") })
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
