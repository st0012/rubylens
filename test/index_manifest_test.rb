# frozen_string_literal: true

require_relative "test_helper"
require "open3"

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
    assert_empty(manifest.dependency_warnings)
  end

  def test_indexes_an_already_materialized_git_checkout_without_git_processes_or_mutation
    with_git_bundle([["git-widget", "1.2.3"]]) do |target, lockfile, checkout, parser, source|
      write_git_gem(
        checkout,
        name: "git-widget",
        version: "1.2.3",
        require_paths: ["lib"],
        files: {
          "lib/git_widget.rb" => "class GitWidget\nend\n",
          "private/not_loaded.rb" => "PrivateGitValue = 1\n",
        },
      )
      locked = parser.specs.first
      before = checkout_snapshot(checkout)
      manifest = RubyLens::Index::Manifest.new(root: target, lockfile: lockfile)
      caller_bundle_root = Bundler.root
      caller_bundle_path = Bundler.bundle_path
      Open3.expects(:capture3).never
      caller_checkout = source.path

      package = manifest.send(:package_for, locked, Set["git-widget"])

      refute_equal(checkout.realpath, caller_checkout)
      refute(source.allow_git_ops?)
      assert_equal(checkout.realpath, source.path)
      assert_equal(caller_bundle_root, Bundler.root)
      assert_equal(caller_bundle_path, Bundler.bundle_path)
      assert_equal(before, checkout_snapshot(checkout))
      assert_equal("git-widget", package.name)
      assert_equal("direct", package.role)
      assert_equal(checkout.realpath, package.root)
      assert_equal([checkout.join("lib/git_widget.rb").realpath.to_s], package.files)
      assert_empty(manifest.dependency_systems)
      refute_includes(package.files, checkout.join("private/not_loaded.rb").realpath.to_s)
      assert_empty(manifest.dependency_warnings)
    end
  end

  def test_normal_checkout_keeps_its_package_root_when_the_gemspec_is_an_internal_symlink
    with_git_bundle([["git-widget", "1.2.3"]]) do |target, lockfile, checkout, parser, _source|
      write_git_gem(
        checkout,
        name: "git-widget",
        version: "1.2.3",
        require_paths: ["lib"],
        files: { "lib/git_widget.rb" => "class GitWidget\nend\n" },
      )
      metadata = checkout.join("metadata")
      FileUtils.mkdir_p(metadata)
      FileUtils.mv(checkout.join("git-widget.gemspec"), metadata.join("git-widget.gemspec"))
      File.symlink(metadata.join("git-widget.gemspec"), checkout.join("git-widget.gemspec"))

      manifest = build_manifest_with_parser(parser, root: target, lockfile: lockfile)
      package = manifest.packages.fetch(0)

      assert_equal(checkout.realpath, package.root)
      assert_equal([checkout.join("lib/git_widget.rb").realpath.to_s], package.files)
      assert_empty(manifest.dependency_warnings)
    end
  end

  def test_indexes_an_immutable_symlink_farm_through_logical_require_paths
    with_git_bundle([["git-widget", "1.2.3"]]) do |target, lockfile, checkout, parser, _source|
      store_root = target.parent.join("immutable-store")
      package_root = store_root.join("00000000000000000000000000000000-git-widget")
      write_git_gem(
        package_root,
        name: "git-widget",
        version: "1.2.3",
        require_paths: ["lib", "src"],
        files: {
          "lib/git_widget.rb" => "class GitWidget\nend\n",
          "src/git_widget/source.rb" => "class GitWidget::Source\nend\n",
        },
      )
      FileUtils.mkdir_p(checkout.join("lib"))
      File.symlink(package_root.join("git-widget.gemspec"), checkout.join("git-widget.gemspec"))
      File.symlink(package_root.join("lib/git_widget.rb"), checkout.join("lib/git_widget.rb"))
      File.symlink(package_root.join("lib/git_widget.rb"), checkout.join("lib/git_widget_alias.rb"))
      File.symlink(package_root.join("src"), checkout.join("src"))

      manifest = build_manifest_with_parser(
        parser,
        root: target,
        lockfile: lockfile,
        immutable_store_root: store_root,
      )
      package = manifest.packages.fetch(0)

      assert_equal(package_root.realpath, package.root)
      assert_equal(
        [package_root.join("lib/git_widget.rb").realpath.to_s,
         package_root.join("src/git_widget/source.rb").realpath.to_s],
        package.files,
      )
      assert_equal(package.files, manifest.files)
      assert_equal(package.files.uniq, package.files)
      assert_empty(manifest.dependency_warnings)
    end
  end

  def test_immutable_symlink_farm_preserves_nested_multi_gemspec_ownership
    lock_specs = [["outer-gem", "1.0.0"], ["inner-gem", "2.0.0"]]
    with_git_bundle(lock_specs) do |target, lockfile, checkout, parser, _source|
      store_root = target.parent.join("immutable-store")
      repository_root = store_root.join("11111111111111111111111111111111-multi-gem")
      write_git_gem(
        repository_root,
        name: "outer-gem",
        version: "1.0.0",
        require_paths: ["lib", "inner/lib"],
        files: { "lib/outer_gem.rb" => "class OuterGem\nend\n" },
      )
      write_git_gem(
        repository_root.join("inner"),
        name: "inner-gem",
        version: "2.0.0",
        require_paths: ["lib"],
        files: { "lib/inner_gem.rb" => "class InnerGem\nend\n" },
      )
      FileUtils.mkdir_p([checkout.join("lib"), checkout.join("inner/lib")])
      File.symlink(repository_root.join("outer-gem.gemspec"), checkout.join("outer-gem.gemspec"))
      File.symlink(repository_root.join("lib/outer_gem.rb"), checkout.join("lib/outer_gem.rb"))
      File.symlink(repository_root.join("inner/inner-gem.gemspec"), checkout.join("inner/inner-gem.gemspec"))
      File.symlink(repository_root.join("inner/lib/inner_gem.rb"), checkout.join("inner/lib/inner_gem.rb"))

      manifest = build_manifest_with_parser(
        parser,
        root: target,
        lockfile: lockfile,
        immutable_store_root: store_root,
      )
      outer_index = manifest.packages.index { |package| package.name == "outer-gem" }
      inner_index = manifest.packages.index { |package| package.name == "inner-gem" }
      inner_file = repository_root.join("inner/lib/inner_gem.rb").realpath.to_s

      assert_includes(manifest.packages.fetch(outer_index).files, inner_file)
      assert_includes(manifest.packages.fetch(inner_index).files, inner_file)
      assert_equal(inner_index, manifest.package_index_for(inner_file))
      assert_equal(1, manifest.files.count(inner_file))
    end
  end

  def test_zero_file_git_meta_package_remains_in_the_manifest
    with_git_bundle([["meta-gem", "1.0.0"]]) do |target, lockfile, checkout, parser, _source|
      store_root = target.parent.join("immutable-store")
      package_root = store_root.join("22222222222222222222222222222222-meta-gem")
      write_git_gem(
        package_root,
        name: "meta-gem",
        version: "1.0.0",
        require_paths: ["lib"],
        files: {},
      )
      FileUtils.mkdir_p(checkout)
      File.symlink(package_root.join("meta-gem.gemspec"), checkout.join("meta-gem.gemspec"))

      manifest = build_manifest_with_parser(
        parser,
        root: target,
        lockfile: lockfile,
        immutable_store_root: store_root,
      )

      assert_equal(["meta-gem"], manifest.packages.map(&:name))
      assert_empty(manifest.packages.fetch(0).files)
      assert_empty(manifest.files)
      assert_empty(manifest.dependency_warnings)
    end
  end

  def test_rejects_traversing_and_absolute_git_require_paths
    ["../private", File.join(File::SEPARATOR, "private")].each do |unsafe_path|
      with_git_bundle([["unsafe-gem", "1.0.0"]]) do |target, lockfile, checkout, parser, _source|
        write_git_gem(
          checkout,
          name: "unsafe-gem",
          version: "1.0.0",
          require_paths: [unsafe_path],
          files: {},
        )

        manifest = build_manifest_with_parser(parser, root: target, lockfile: lockfile)

        assert_empty(manifest.packages)
        assert_equal(
          [{ "name" => "unsafe-gem", "reason" => "Locked require paths failed containment checks" }],
          manifest.dependency_warnings,
        )
      end
    end
  end

  def test_rejects_a_malformed_git_require_path_with_a_canned_reason
    with_git_bundle([["unsafe-gem", "1.0.0"]]) do |target, lockfile, checkout, parser, source|
      write_git_gem(
        checkout,
        name: "unsafe-gem",
        version: "1.0.0",
        require_paths: ["lib"],
        files: {},
      )
      Open3.expects(:capture3).never
      source.__send__(:set_install_path!, checkout)
      spec_index = source.specs
      specification = spec_index.search(parser.specs.first).first
      specification.stubs(:require_paths).returns(["lib\0private"])
      source.stubs(:specs).returns(spec_index)

      manifest = build_manifest_with_parser(parser, root: target, lockfile: lockfile)

      assert_empty(manifest.packages)
      assert_equal(
        [{ "name" => "unsafe-gem", "reason" => "Locked require paths failed containment checks" }],
        manifest.dependency_warnings,
      )
    end
  end

  def test_rejects_dangling_and_looping_git_package_links
    ["dangling", "file-loop", "directory-loop"].each do |failure|
      with_git_bundle([["unsafe-gem", "1.0.0"]]) do |target, lockfile, checkout, parser, _source|
        write_git_gem(
          checkout,
          name: "unsafe-gem",
          version: "1.0.0",
          require_paths: ["lib"],
          files: {},
        )
        FileUtils.mkdir_p(checkout.join("lib"))
        link = checkout.join(failure == "directory-loop" ? "lib/loop" : "lib/unsafe.rb")
        target_path = case failure
                      when "dangling" then checkout.join("missing.rb")
                      when "file-loop" then link
                      when "directory-loop" then checkout.join("lib")
                      end
        File.symlink(target_path, link)

        manifest = build_manifest_with_parser(parser, root: target, lockfile: lockfile)

        assert_empty(manifest.packages)
        assert_equal(
          [{ "name" => "unsafe-gem", "reason" => "Locked package files failed containment checks" }],
          manifest.dependency_warnings,
        )
      end
    end
  end

  def test_rejects_cross_package_targets_in_a_recognized_store
    with_git_bundle([["git-widget", "1.2.3"]]) do |target, lockfile, checkout, parser, _source|
      store_root = target.parent.join("immutable-store")
      package_root = store_root.join("33333333333333333333333333333333-git-widget")
      other_root = store_root.join("44444444444444444444444444444444-other")
      write_git_gem(
        package_root,
        name: "git-widget",
        version: "1.2.3",
        require_paths: ["lib"],
        files: {},
      )
      FileUtils.mkdir_p([checkout.join("lib"), other_root.join("lib")])
      File.write(other_root.join("lib/other.rb"), "Other = 1\n")
      File.symlink(package_root.join("git-widget.gemspec"), checkout.join("git-widget.gemspec"))
      File.symlink(other_root.join("lib/other.rb"), checkout.join("lib/git_widget.rb"))

      manifest = build_manifest_with_parser(
        parser,
        root: target,
        lockfile: lockfile,
        immutable_store_root: store_root,
      )

      assert_empty(manifest.packages)
      assert_equal(
        [{ "name" => "git-widget", "reason" => "Locked package files failed containment checks" }],
        manifest.dependency_warnings,
      )
    end
  end

  def test_default_store_policy_rejects_arbitrary_external_roots_without_leaking_details
    provider = RubyLens::Index::Manifest::NixStoreProvider.new
    refute(provider.trusted?(Pathname(File::SEPARATOR)))
    refute(provider.trusted?(Pathname("/tmp/nix/store/00000000000000000000000000000000-example")))
    assert(provider.trusted?(Pathname("/nix/store/00000000000000000000000000000000-example/lib")))

    with_git_bundle(
      [["private-git-gem", "4.5.6"]],
      remote: "https://secret-user@example.invalid/private/repository.git",
    ) do |target, lockfile, checkout, parser, _source|
      arbitrary_root = target.parent.join("arbitrary-provider-root")
      write_git_gem(
        arbitrary_root,
        name: "private-git-gem",
        version: "4.5.6",
        require_paths: ["lib"],
        files: { "lib/private_git_gem.rb" => "PrivateGitGem = 1\n" },
      )
      FileUtils.mkdir_p(checkout)
      File.symlink(arbitrary_root.join("private-git-gem.gemspec"), checkout.join("private-git-gem.gemspec"))
      File.symlink(arbitrary_root.join("lib"), checkout.join("lib"))

      manifest = build_manifest_with_parser(parser, root: target, lockfile: lockfile)

      assert_empty(manifest.packages)
      exposed = JSON.generate([manifest.warnings, manifest.dependency_warnings])
      assert_includes(exposed, "private-git-gem")
      refute_includes(exposed, target.parent.to_s)
      refute_includes(exposed, arbitrary_root.to_s)
      refute_includes(exposed, "example.invalid")
      refute_includes(exposed, "0123456789abcdef")
      refute_includes(exposed, Dir.home)
    end
  end

  def test_symlinked_checkout_requires_immutable_store_attestation
    with_git_bundle([["linked-checkout-gem", "1.0.0"]]) do |target, lockfile, checkout, parser, _source|
      arbitrary_root = target.parent.join("arbitrary-checkout-root")
      write_git_gem(
        arbitrary_root,
        name: "linked-checkout-gem",
        version: "1.0.0",
        require_paths: ["lib"],
        files: { "lib/linked_checkout_gem.rb" => "LinkedCheckoutGem = 1\n" },
      )
      FileUtils.mkdir_p(checkout.parent)
      File.symlink(arbitrary_root, checkout)

      rejected = build_manifest_with_parser(parser, root: target, lockfile: lockfile)
      accepted = build_manifest_with_parser(
        parser,
        root: target,
        lockfile: lockfile,
        immutable_store_root: arbitrary_root,
      )

      assert_empty(rejected.packages)
      assert_equal(
        [{ "name" => "linked-checkout-gem", "reason" =>
          "Locked gemspec or package root failed containment checks" }],
        rejected.dependency_warnings,
      )
      assert_equal(["linked-checkout-gem"], accepted.packages.map(&:name))
      assert_equal(
        [arbitrary_root.join("lib/linked_checkout_gem.rb").realpath.to_s],
        accepted.packages.fetch(0).files,
      )
    end
  end

  def test_unavailable_git_checkout_uses_a_canned_path_free_reason_without_git_processes
    with_git_bundle(
      [["private-git-gem", "4.5.6"]],
      remote: "https://secret-user@example.invalid/private/repository.git",
    ) do |target, lockfile, missing, parser, source|
      source.expects(:path).never
      source.expects(:specs).never
      Open3.expects(:capture3).never
      manifest = RubyLens::Index::Manifest.new(root: target, lockfile: lockfile)

      package = manifest.send(:package_for, parser.specs.first, Set["private-git-gem"])

      assert_nil(package)
      refute(source.allow_git_ops?)
      refute_path_exists(missing)
      assert_equal(
        [{ "name" => "private-git-gem", "reason" => "Bundler checkout is unavailable" }],
        manifest.dependency_warnings,
      )
      exposed = JSON.generate([manifest.warnings, manifest.dependency_warnings])
      assert_includes(exposed, "private-git-gem")
      refute_includes(exposed, target.parent.to_s)
      refute_includes(exposed, "example.invalid")
      refute_includes(exposed, "0123456789abcdef")
      refute_includes(exposed, Dir.home)
    end
  end

  def test_git_source_with_remote_operations_enabled_is_rejected_before_any_git_process
    with_git_bundle(
      [["remote-enabled-gem", "1.0.0"]],
    ) do |target, lockfile, _checkout, parser, source|
      source.remote!
      source.expects(:extension_dir_name).never
      Open3.expects(:capture3).never
      manifest = RubyLens::Index::Manifest.new(root: target, lockfile: lockfile)

      package = manifest.send(:package_for, parser.specs.first, Set["remote-enabled-gem"])

      assert_nil(package)
      assert(source.allow_git_ops?)
      assert_equal(
        [{ "name" => "remote-enabled-gem", "reason" => "Bundler source is not available for local-only indexing" }],
        manifest.dependency_warnings,
      )
    end
  end

  def test_multi_gemspec_git_checkout_assigns_overlapping_files_to_one_deterministic_owner
    lock_specs = [["outer-gem", "1.0.0"], ["inner-gem", "2.0.0"]]
    with_git_bundle(lock_specs) do |target, lockfile, checkout, parser, source|
      write_git_gem(
        checkout,
        name: "outer-gem",
        version: "1.0.0",
        require_paths: ["lib", "inner/lib"],
        files: { "lib/outer_gem.rb" => "class OuterGem\nend\n" },
      )
      write_git_gem(
        checkout.join("inner"),
        name: "inner-gem",
        version: "2.0.0",
        require_paths: ["lib"],
        files: { "lib/inner_gem.rb" => "class InnerGem\nend\n" },
      )
      Open3.expects(:capture3).never
      source.__send__(:set_install_path!, checkout)
      spec_index = source.specs
      source.expects(:specs).twice.returns(spec_index)

      manifest = build_manifest_with_parser(parser, root: target, lockfile: lockfile)
      repeated = build_manifest_with_parser(parser, root: target, lockfile: lockfile)
      outer_index = manifest.packages.index { |package| package.name == "outer-gem" }
      inner_index = manifest.packages.index { |package| package.name == "inner-gem" }
      outer_file = checkout.join("lib/outer_gem.rb").realpath.to_s
      overlapping_file = checkout.join("inner/lib/inner_gem.rb").realpath.to_s

      assert_equal(outer_index, manifest.package_index_for(outer_file))
      assert_equal(inner_index, manifest.package_index_for(overlapping_file))
      assert_includes(manifest.packages.fetch(outer_index).files, overlapping_file)
      assert_includes(manifest.packages.fetch(inner_index).files, overlapping_file)
      assert_equal(1, manifest.files.count(overlapping_file))
      assert_equal(manifest.files.uniq, manifest.files)
      assert_equal(
        manifest.packages.map { |package| [package.name, package.files] },
        repeated.packages.map { |package| [package.name, package.files] },
      )

      snapshot = RubyLens::Index::RubydexAdapter.new(manifest).index
      inner = snapshot.fetch("packages").find { |package| package.fetch("name") == "inner-gem" }
      outer = snapshot.fetch("packages").find { |package| package.fetch("name") == "outer-gem" }
      assert_equal(1, inner.fetch("declaration_count"))
      assert_equal(1, outer.fetch("declaration_count"))
    end
  end

  def test_multi_gem_git_source_keeps_zero_file_anchor_and_builds_one_private_system
    remote = "https://credential@example.invalid/private/repository.git"
    lock_specs = [["system-meta", "1.0.0"], ["system-implementation", "2.0.0"]]
    with_git_bundle(lock_specs, remote:, direct: ["system-meta"]) do |target, lockfile, checkout, parser, _source|
      write_git_gem(
        checkout,
        name: "system-meta",
        version: "1.0.0",
        require_paths: ["lib"],
        files: {},
      )
      write_git_gem(
        checkout.join("implementation"),
        name: "system-implementation",
        version: "2.0.0",
        require_paths: ["lib"],
        files: { "lib/system_implementation.rb" => "class SystemImplementation\nend\n" },
      )

      first = build_manifest_with_parser(parser, root: target, lockfile: lockfile)
      second = build_manifest_with_parser(parser, root: target, lockfile: lockfile)
      system = first.dependency_systems.fetch(0)
      packages = first.packages
      meta_index = packages.index { |package| package.name == "system-meta" }
      implementation_index = packages.index { |package| package.name == "system-implementation" }

      assert_equal(2, packages.length)
      assert_empty(packages.fetch(meta_index).files)
      assert_equal("direct", packages.fetch(meta_index).role)
      assert_equal("transitive", packages.fetch(implementation_index).role)
      assert_equal([implementation_index, meta_index].sort, system.package_indexes.sort)
      assert_equal(meta_index, system.label_package_index)
      assert_equal(0, system.id)
      assert_equal(first.dependency_systems, second.dependency_systems)
      assert_equal(
        first.packages.map { |package| [package.name, package.role, package.files] },
        second.packages.map { |package| [package.name, package.role, package.files] },
      )
      serialized = JSON.generate(first.dependency_systems.map(&:to_h))
      refute_includes(serialized, remote)
      refute_includes(serialized, "0123456789abcdef")
      refute_includes(serialized, checkout.to_s)
      assert_empty(first.dependency_warnings)

      snapshot = RubyLens::Index::RubydexAdapter.new(first).index
      snapshot_packages = snapshot.fetch("packages").to_h { |package| [package.fetch("name"), package] }
      model = RubyLens::ArtModelBuilder.new(seed: 12).build(snapshot)
      showcase = RubyLens::ShowcaseModel.new(model).call
      payloads = [snapshot, model, showcase].map { |payload| JSON.generate(payload) }

      assert_equal(0, snapshot_packages.fetch("system-meta").fetch("declaration_count"))
      assert_equal(1, snapshot_packages.fetch("system-implementation").fetch("declaration_count"))
      assert_equal(0, snapshot_packages.fetch("system-meta").fetch("role"))
      assert_equal(1, snapshot_packages.fetch("system-implementation").fetch("role"))
      assert_equal(2, model.dig("totals", "packages"))
      assert_equal(1, model.dig("totals", "dependencyStars"))
      assert_equal(1, model.fetch("dependencySystems").length)
      assert(showcase.fetch("packages").all? { |row| row.all?(Integer) })
      assert(showcase.fetch("dependencySystems").flatten.all?(Integer))
      payloads.each do |payload|
        refute_includes(payload, remote)
        refute_includes(payload, "credential@example.invalid")
        refute_includes(payload, "0123456789abcdef")
        refute_includes(payload, checkout.to_s)
      end
    end
  end

  def test_multi_gem_git_source_uses_deterministic_safe_label_fallbacks
    lock_specs = [["zeta-member", "1.0.0"], ["alpha-member", "1.0.0"]]
    {
      ["zeta-member", "alpha-member"] => "alpha-member",
      [] => "alpha-member",
    }.each do |direct, expected_label|
      with_git_bundle(lock_specs, direct:) do |target, lockfile, checkout, parser, _source|
        write_git_gem(
          checkout,
          name: "zeta-member",
          version: "1.0.0",
          require_paths: ["lib"],
          files: { "lib/zeta_member.rb" => "ZetaMember = 1\n" },
        )
        write_git_gem(
          checkout.join("alpha"),
          name: "alpha-member",
          version: "1.0.0",
          require_paths: ["lib"],
          files: { "lib/alpha_member.rb" => "AlphaMember = 1\n" },
        )

        manifest = build_manifest_with_parser(parser, root: target, lockfile: lockfile)
        system = manifest.dependency_systems.fetch(0)

        assert_equal(expected_label, manifest.packages.fetch(system.label_package_index).name)
      end
    end
  end

  def test_all_empty_multi_gem_git_source_keeps_package_anchors
    lock_specs = [["anchor-meta", "1.0.0"], ["anchor-companion", "1.0.0"]]
    with_git_bundle(lock_specs, direct: ["anchor-meta"]) do |target, lockfile, checkout, parser, _source|
      write_git_gem(
        checkout,
        name: "anchor-meta",
        version: "1.0.0",
        require_paths: ["lib"],
        files: {},
      )
      write_git_gem(
        checkout.join("companion"),
        name: "anchor-companion",
        version: "1.0.0",
        require_paths: ["lib"],
        files: {},
      )

      manifest = build_manifest_with_parser(parser, root: target, lockfile: lockfile)
      assert_equal(1, manifest.dependency_systems.length)
      system = manifest.dependency_systems.fetch(0)

      assert_equal(2, manifest.packages.length)
      assert(manifest.packages.all? { |package| package.files.empty? })
      assert_equal(%w[anchor-companion anchor-meta], system.package_indexes.map { |index| manifest.packages.fetch(index).name })
      assert_equal("anchor-meta", manifest.packages.fetch(system.label_package_index).name)
      assert_empty(manifest.dependency_warnings)
    end
  end

  def test_zero_file_single_git_package_remains_ungrouped
    with_git_bundle([["empty-git-package", "1.0.0"]]) do |target, lockfile, checkout, parser, _source|
      write_git_gem(
        checkout,
        name: "empty-git-package",
        version: "1.0.0",
        require_paths: ["lib"],
        files: {},
      )

      manifest = build_manifest_with_parser(parser, root: target, lockfile: lockfile)

      assert_equal(["empty-git-package"], manifest.packages.map(&:name))
      assert_empty(manifest.packages.fetch(0).files)
      assert_empty(manifest.dependency_systems)
      assert_empty(manifest.dependency_warnings)
    end
  end

  def test_separate_multi_gem_git_sources_get_distinct_deterministically_ordered_systems
    Dir.mktmpdir("rubylens-multi-git-sources-", FIXTURE.to_s) do |directory|
      bundle_root = Pathname(directory)
      target = bundle_root.join("app")
      FileUtils.mkdir_p([target, bundle_root.join(".bundle")])
      File.write(bundle_root.join(".gitignore"), "/vendor/bundle/\n")
      File.write(bundle_root.join(".bundle/config"), "---\nBUNDLE_PATH: \"vendor/bundle\"\n")
      lockfile = bundle_root.join("Gemfile.lock")
      lockfile.write(<<~LOCKFILE)
        GIT
          remote: https://example.invalid/zeta.git
          revision: 1111111111111111111111111111111111111111
          specs:
            zeta-implementation (1.0.0)
            zeta-meta (1.0.0)

        GIT
          remote: https://example.invalid/alpha.git
          revision: 2222222222222222222222222222222222222222
          specs:
            alpha-implementation (1.0.0)
            alpha-meta (1.0.0)

        PLATFORMS
          ruby

        DEPENDENCIES
          alpha-meta!
          zeta-meta!

        BUNDLED WITH
           4.0.10
      LOCKFILE
      parser = Bundler::LockfileParser.new(lockfile.read)
      bundle_path = Pathname(Bundler::Settings.new(bundle_root.join(".bundle")).path.path).expand_path(bundle_root)
      parser.sources.grep(Bundler::Source::Git).each do |source|
        checkout = bundle_path.join("bundler/gems", source.extension_dir_name)
        prefix = source.uri.include?("alpha") ? "alpha" : "zeta"
        write_git_gem(
          checkout,
          name: "#{prefix}-meta",
          version: "1.0.0",
          require_paths: ["lib"],
          files: { "lib/#{prefix}_meta.rb" => "#{prefix.capitalize}Meta = 1\n" },
        )
        write_git_gem(
          checkout.join("implementation"),
          name: "#{prefix}-implementation",
          version: "1.0.0",
          require_paths: ["lib"],
          files: { "lib/#{prefix}_implementation.rb" => "#{prefix.capitalize}Implementation = 1\n" },
        )
      end

      manifest = build_manifest_with_parser(parser, root: target, lockfile: lockfile)
      systems = manifest.dependency_systems.map do |system|
        system.package_indexes.map { |index| manifest.packages.fetch(index).name }
      end

      assert_equal(
        [["alpha-implementation", "alpha-meta"], ["zeta-implementation", "zeta-meta"]],
        systems,
      )
      assert_equal([0, 1], manifest.dependency_systems.map(&:id))
      assert_equal(["alpha-meta", "zeta-meta"], manifest.dependency_systems.map { |system| manifest.packages.fetch(system.label_package_index).name })
      assert_equal(4, manifest.packages.length)
    end
  end

  def test_path_dependency_behavior_remains_workspace_only
    lockfile = <<~LOCKFILE
      PATH
        remote: #{FIXTURE}
        specs:
          fixture-gem (1.0.0)

      PLATFORMS
        ruby

      DEPENDENCIES
        fixture-gem!

      BUNDLED WITH
         4.0.10
    LOCKFILE

    Dir.mktmpdir("rubylens-path-lockfile-") do |directory|
      path = File.join(directory, "Gemfile.lock")
      File.write(path, lockfile)
      manifest = RubyLens::Index::Manifest.build(root: FIXTURE, lockfile: path)

      assert_empty(manifest.packages)
      assert_empty(manifest.warnings)
      assert_empty(manifest.dependency_warnings)
    end
  end

  def test_package_lookup_preserves_nested_root_priority_and_caches_fallbacks
    manifest = RubyLens::Index::Manifest.allocate
    manifest.instance_variable_set(:@package_roots, [[Pathname("/tmp/gems/nested"), 1], [Pathname("/tmp/gems"), 0]])
    manifest.instance_variable_set(
      :@package_index_by_file,
      { "/tmp/gems/exact.rb" => 0, "/tmp/workspace.rb" => nil },
    )
    manifest.instance_variable_set(:@package_index_cache, {})
    nested = "/tmp/gems/nested/lib/example.rb"
    elsewhere = "/tmp/elsewhere/example.rb"

    assert_equal(1, manifest.send(:uncached_package_index_for, nested))
    assert_nil(manifest.send(:uncached_package_index_for, elsewhere))
    manifest.expects(:uncached_package_index_for).with(nested).once.returns(1)
    manifest.expects(:uncached_package_index_for).with(elsewhere).once.returns(nil)

    assert_equal(0, manifest.package_index_for("/tmp/gems/exact.rb"))
    assert_nil(manifest.package_index_for("/tmp/workspace.rb"))
    assert_equal(1, manifest.package_index_for(nested))
    assert_equal(1, manifest.package_index_for(nested))
    assert_nil(manifest.package_index_for(elsewhere))
    assert_nil(manifest.package_index_for(elsewhere))
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

  private

  def write_git_gem(root, name:, version:, require_paths:, files:)
    FileUtils.mkdir_p(root)
    files.each do |relative, source|
      path = root.join(relative)
      FileUtils.mkdir_p(path.dirname)
      File.write(path, source)
    end
    specification = Gem::Specification.new do |gem|
      gem.name = name
      gem.version = version
      gem.summary = "Synthetic Git fixture"
      gem.authors = ["RubyLens tests"]
      gem.files = files.keys
      gem.require_paths = require_paths
    end
    File.write(root.join("#{name}.gemspec"), specification.to_ruby)
  end

  def git_parser(specifications, remote: "https://example.invalid/repository.git", lockfile: nil, direct: specifications.map(&:first))
    specs = specifications.map { |name, version| "    #{name} (#{version})" }.join("\n")
    dependencies = direct.map { |name| "  #{name}!" }.join("\n")
    contents = <<~LOCKFILE
      GIT
        remote: #{remote}
        revision: 0123456789abcdef0123456789abcdef01234567
        specs:
      #{specs}

      PLATFORMS
        ruby

      DEPENDENCIES
      #{dependencies}

      BUNDLED WITH
         4.0.10
    LOCKFILE
    File.write(lockfile, contents) if lockfile
    parser = Bundler::LockfileParser.new(contents)
    [parser, parser.specs.first.source]
  end

  def with_git_bundle(specifications, remote: "https://example.invalid/repository.git", direct: specifications.map(&:first))
    Dir.mktmpdir("rubylens-git-bundle-", FIXTURE.to_s) do |directory|
      bundle_root = Pathname(directory)
      target = bundle_root.join("app")
      FileUtils.mkdir_p([target, bundle_root.join(".bundle")])
      File.write(bundle_root.join(".gitignore"), "/vendor/bundle/\n")
      File.write(bundle_root.join(".bundle/config"), "---\nBUNDLE_PATH: \"vendor/bundle\"\n")
      lockfile = bundle_root.join("Gemfile.lock")
      parser, source = git_parser(specifications, remote: remote, lockfile: lockfile, direct:)
      bundle_path = Pathname(Bundler::Settings.new(bundle_root.join(".bundle")).path.path).expand_path(bundle_root)
      checkout = bundle_path.join("bundler/gems", source.extension_dir_name)
      yield target, lockfile, checkout, parser, source
    end
  end

  def build_manifest_with_parser(parser, root:, lockfile:, immutable_store_root: nil)
    if immutable_store_root
      provider = mock("immutable Git store provider")
      provider.stubs(:trusted?).returns(false)
      provider.stubs(:trusted?).with { |path| RubyLens::Paths.inside?(path, immutable_store_root) }.returns(true)
      RubyLens::Index::Manifest::NixStoreProvider.stubs(:new).returns(provider)
    end
    begin
      manifest = RubyLens::Index::Manifest.new(root: root, lockfile: lockfile)
      repository = stub("Git repository", selected_files: [])
      RubyLens::GitRepository.stubs(:new).with(manifest.root).returns(repository)
      Bundler::LockfileParser.stubs(:new).with(lockfile.read).returns(parser)
      Open3.expects(:capture3).never
      begin
        manifest.build
      ensure
        RubyLens::GitRepository.unstub(:new)
        Bundler::LockfileParser.unstub(:new)
      end
    ensure
      RubyLens::Index::Manifest::NixStoreProvider.unstub(:new) if immutable_store_root
    end
  end

  def checkout_snapshot(root)
    Dir.glob(root.join("**/*").to_s, File::FNM_DOTMATCH).sort.filter_map do |path|
      next if [".", ".."].include?(File.basename(path))

      stat = File.lstat(path)
      [Pathname(path).relative_path_from(root).to_s, stat.ftype, stat.mode, stat.size, stat.mtime.to_r,
        stat.file? ? File.binread(path) : nil]
    end
  end
end
