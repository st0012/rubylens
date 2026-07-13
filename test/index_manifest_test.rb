# frozen_string_literal: true

require_relative "test_helper"
require "open3"

class IndexManifestTest < Minitest::Test
  include SnapshotHelpers

  OPEN3_CAPTURE_GUARD = Module.new do
    def capture3(...)
      if Thread.current[:rubylens_forbid_git_subprocess]
        raise "unexpected Git subprocess"
      end

      super
    end
  end
  LOCKFILE_PARSER_OVERRIDE = Module.new do
    def new(...)
      Thread.current[:rubylens_lockfile_parser] || super
    end
  end
  Open3.singleton_class.prepend(OPEN3_CAPTURE_GUARD)
  Bundler::LockfileParser.singleton_class.prepend(LOCKFILE_PARSER_OVERRIDE)

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
    Dir.mktmpdir("rubylens-git-checkout-") do |directory|
      checkout = Pathname(directory).join("checkout")
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
      parser, source = git_parser([["git-widget", "1.2.3"]], checkout: checkout)
      locked = parser.specs.first
      before = checkout_snapshot(checkout)
      manifest = RubyLens::Index::Manifest.new(root: FIXTURE)

      package = without_git_subprocesses do
        manifest.send(:package_for, locked, Set["git-widget"])
      end

      refute(source.allow_git_ops?)
      assert_equal(before, checkout_snapshot(checkout))
      assert_equal("git-widget", package.name)
      assert_equal("direct", package.role)
      assert_equal(checkout.realpath, package.root)
      assert_equal([checkout.join("lib/git_widget.rb").realpath.to_s], package.files)
      refute_includes(package.files, checkout.join("private/not_loaded.rb").realpath.to_s)
      assert_empty(manifest.dependency_warnings)
    end
  end

  def test_unavailable_git_checkout_uses_a_canned_path_free_reason_without_git_processes
    Dir.mktmpdir("rubylens-missing-git-checkout-") do |directory|
      missing = Pathname(directory).join("not-materialized")
      parser, source = git_parser(
        [["private-git-gem", "4.5.6"]],
        checkout: missing,
        remote: "https://secret-user@example.invalid/private/repository.git",
      )
      manifest = RubyLens::Index::Manifest.new(root: FIXTURE)

      package = without_git_subprocesses do
        manifest.send(:package_for, parser.specs.first, Set["private-git-gem"])
      end

      assert_nil(package)
      refute(source.allow_git_ops?)
      refute_path_exists(missing)
      assert_equal(
        [{ "name" => "private-git-gem", "reason" => "Bundler checkout is unavailable" }],
        manifest.dependency_warnings,
      )
      exposed = JSON.generate([manifest.warnings, manifest.dependency_warnings])
      assert_includes(exposed, "private-git-gem")
      refute_includes(exposed, directory)
      refute_includes(exposed, "example.invalid")
      refute_includes(exposed, "0123456789abcdef")
      refute_includes(exposed, Dir.home)
    end
  end

  def test_git_source_with_remote_operations_enabled_is_rejected_before_any_git_process
    Dir.mktmpdir("rubylens-remote-enabled-git-") do |directory|
      checkout = Pathname(directory).join("checkout")
      write_git_gem(
        checkout,
        name: "remote-enabled-gem",
        version: "1.0.0",
        require_paths: ["lib"],
        files: { "lib/remote_enabled_gem.rb" => "RemoteEnabledGem = 1\n" },
      )
      parser, source = git_parser([["remote-enabled-gem", "1.0.0"]], checkout: checkout)
      source.remote!
      manifest = RubyLens::Index::Manifest.new(root: FIXTURE)

      package = without_git_subprocesses do
        manifest.send(:package_for, parser.specs.first, Set["remote-enabled-gem"])
      end

      assert_nil(package)
      assert(source.allow_git_ops?)
      assert_equal(
        [{ "name" => "remote-enabled-gem", "reason" => "Bundler source is not available for local-only indexing" }],
        manifest.dependency_warnings,
      )
    end
  end

  def test_multi_gemspec_git_checkout_assigns_overlapping_files_to_one_deterministic_owner
    Dir.mktmpdir("rubylens-multi-gemspec-") do |directory|
      checkout = Pathname(directory).join("checkout")
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
      lock_specs = [["outer-gem", "1.0.0"], ["inner-gem", "2.0.0"]]
      parser, source = git_parser(lock_specs, checkout: checkout)
      spec_index_calls = 0
      source.define_singleton_method(:specs) do
        spec_index_calls += 1
        super()
      end

      manifest = build_manifest_with_parser(parser)
      repeated = build_manifest_with_parser(parser)
      outer_index = manifest.packages.index { |package| package.name == "outer-gem" }
      inner_index = manifest.packages.index { |package| package.name == "inner-gem" }
      outer_file = checkout.join("lib/outer_gem.rb").realpath.to_s
      overlapping_file = checkout.join("inner/lib/inner_gem.rb").realpath.to_s

      assert_equal(2, spec_index_calls)
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

      snapshot = RubyLens::Index::RubydexAdapter.new.index(manifest)
      inner = snapshot.fetch("packages").find { |package| package.fetch("name") == "inner-gem" }
      outer = snapshot.fetch("packages").find { |package| package.fetch("name") == "outer-gem" }
      assert_equal(1, inner.fetch("declaration_count"))
      assert_equal(1, outer.fetch("declaration_count"))
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

  def git_parser(specifications, checkout:, remote: "https://example.invalid/repository.git")
    specs = specifications.map { |name, version| "    #{name} (#{version})" }.join("\n")
    dependencies = specifications.map { |name, _version| "  #{name}!" }.join("\n")
    lockfile = <<~LOCKFILE
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
    parser = Bundler::LockfileParser.new(lockfile)
    source = parser.specs.first.source
    source.instance_variable_set(:@install_path, Pathname(checkout))
    [parser, source]
  end

  def build_manifest_with_parser(parser)
    Dir.mktmpdir("rubylens-git-lockfile-") do |directory|
      lockfile = File.join(directory, "Gemfile.lock")
      File.write(lockfile, "stubbed by parsed fixture\n")
      return with_lockfile_parser(parser) { RubyLens::Index::Manifest.build(root: FIXTURE, lockfile: lockfile) }
    end
  end

  def without_git_subprocesses
    Thread.current[:rubylens_forbid_git_subprocess] = true
    yield
  ensure
    Thread.current[:rubylens_forbid_git_subprocess] = nil
  end

  def with_lockfile_parser(parser)
    Thread.current[:rubylens_lockfile_parser] = parser
    yield
  ensure
    Thread.current[:rubylens_lockfile_parser] = nil
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
