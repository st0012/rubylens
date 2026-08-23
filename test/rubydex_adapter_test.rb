# frozen_string_literal: true

require_relative "test_helper"

class RubydexAdapterTest < Minitest::Test
  include SnapshotHelpers

  RSPEC_FIXTURE = ROOT.join("test/fixtures/rspec_repo")

  def test_real_adapter_returns_hover_identity_without_paths_or_source
    manifest = RubyLens::Index::Manifest.build(root: FIXTURE)
    snapshot = RubyLens::Index::RubydexAdapter.new(manifest).index
    serialized = JSON.generate(snapshot)

    assert_equal("rubylens.snapshot.v9", snapshot.fetch("schema"))
    assert_equal("Tiny Repo", snapshot.fetch("project_name"))
    assert_equal(9, snapshot.fetch("namespaces").length)
    assert_equal(9, snapshot.fetch("namespace_names").length)
    assert(snapshot.fetch("namespaces").all? { |row| row.length == 13 && row.all?(Integer) })
    assert_equal({ "core" => [4, 4, 3, 1], "tests" => [1, 0, 0, 0] }, snapshot.fetch("category_stats"))
    assert_equal(6, snapshot.fetch("dependency_signal_maxima").length)
    assert_empty(snapshot.fetch("dependency_systems"))
    assert_includes(snapshot.fetch("namespace_names"), "Demo::Order")
    order_index = snapshot.fetch("namespace_names").index("Demo::Order")
    assert_equal([1, 0, 2, 1, 1], snapshot.fetch("namespaces").fetch(order_index).last(5))
    helper_index = snapshot.fetch("namespace_names").index("Demo::Helper")
    links = snapshot.fetch("constant_reference_links")
    namespace_count = snapshot.fetch("namespaces").length
    assert_equal(1, links.count([order_index, helper_index]))
    assert_equal(links.uniq, links)
    assert(links.all? { |row| row.length == 2 && row.all?(Integer) })
    assert(links.all? do |referring_index, referenced_index|
      referring_index.between?(0, namespace_count - 1) &&
        referenced_index.between?(0, namespace_count - 1)
    end)
    order_test_index = snapshot.fetch("namespace_names").index("Demo::OrderTest")
    assert_equal(0, snapshot.fetch("namespaces").fetch(order_test_index).last)
    refute_includes(serialized, FIXTURE.to_s)
    refute_includes(serialized, "domain.rb")
    refute_includes(serialized, "PRIVATE_VALUE")
  end

  def test_models_raw_rspec_references_as_statless_nonidentifying_proxies
    manifest = RubyLens::Index::Manifest.build(root: RSPEC_FIXTURE)
    snapshot = RubyLens::Index::RubydexAdapter.new(manifest).index
    names = snapshot.fetch("namespace_names")
    rows = names.zip(snapshot.fetch("namespaces")).select do |name, _row|
      name.start_with?("RSpec example group #")
    end
    serialized = JSON.generate(snapshot)

    assert_equal(9, rows.length)
    assert_equal([9, 0, 14, 0], snapshot.fetch("category_stats").fetch("tests"))
    assert(rows.all? { |_name, row| row.length == 13 && row.all?(Integer) })
    assert(rows.all? { |_name, row| row[0] == 0 && row[1] == 1 })
    assert(rows.all? { |_name, row| row.drop(2).all?(&:zero?) })
    assert_equal(rows.length, rows.map(&:first).uniq.length)
    assert_empty(snapshot.fetch("constant_reference_links"))
    assert_equal(
      (1..9).map { |index| format("RSpec example group #%06d", index) },
      rows.map(&:first),
    )
    refute_includes(serialized, RSPEC_FIXTURE.to_s)
    refute_includes(serialized, "service_spec.rb")
    refute_includes(serialized, "space café")
    refute_includes(serialized, "private shared behavior")
    refute_includes(serialized, "crème brûlée")
    refute_includes(serialized, "not an RSpec group")
  end

  def test_preserves_known_project_acronyms
    manifest = Struct.new(:root)
    adapter = ->(root) { RubyLens::Index::RubydexAdapter.new(manifest.new(Pathname(root))) }

    assert_equal("IRB", adapter.call("/tmp/irb").send(:project_name))
    assert_equal("RDoc", adapter.call("/tmp/rdoc").send(:project_name))
  end

  def test_indexes_the_exact_git_selected_manifest_once
    graph = stub(documents: [], resolve: nil, check_integrity: [], declarations: [], constant_references: [])
    manifest = Struct.new(:root, :files, :packages, :warnings, :dependency_warnings).new(
      Pathname("/tmp/example"), ["/tmp/a.rb", "/tmp/b.rb"].freeze, [], [], []
    )

    Rubydex::Graph.expects(:new).with().returns(graph)
    graph.expects(:index_all).with(manifest.files).returns([])
    RubyLens::Index::RubydexAdapter.new(manifest).index

    assert_equal(manifest.files.uniq, manifest.files)
  end

  def test_ignores_target_rubydex_configuration_from_an_unrelated_working_directory
    Dir.mktmpdir("rubylens-config-free-graph-") do |directory|
      base = Pathname(directory)
      root = base.join("target")
      caller = base.join("caller")
      source = root.join("lib/kept.rb")
      source.dirname.mkpath
      caller.mkpath
      source.write("class Kept\nend\n")
      # Malformed syntax makes any accidental target-config load fail loudly.
      root.join("rubydex.toml").write("[graph\n")
      system("git", "-C", root.to_s, "init", "--quiet", exception: true)
      system("git", "-C", root.to_s, "add", "lib/kept.rb", exception: true)
      manifest = RubyLens::Index::Manifest.build(root: root)

      snapshot = Dir.chdir(caller) { RubyLens::Index::RubydexAdapter.new(manifest).index }

      assert_includes(snapshot.fetch("namespace_names"), "Kept")
    end
  end

  def test_reuses_indexed_documents_for_package_audit_and_workspace_rspec_projection
    Dir.mktmpdir("rubylens-rspec-package-documents-") do |directory|
      root = Pathname(directory).join("workspace")
      workspace_spec = root.join("spec/workspace_spec.rb")
      dependency_root = root.join("vendor/bundle/ruby/4.0.0/bundler/gems/dependency-abc123")
      dependency_spec = dependency_root.join("spec/dependency_spec.rb")
      FileUtils.mkdir_p(workspace_spec.dirname)
      FileUtils.mkdir_p(dependency_spec.dirname)
      workspace_spec.write("describe(\"workspace\") { it(\"kept\") {} }\n")
      dependency_spec.write("DEPENDENCY_CONST = 1; describe(\"dependency\") { specify(\"hidden\") {} }\n")

      package = RubyLens::Index::Manifest::Package.new(
        "dependency", "1.0.0", "direct", "external", dependency_root.realpath,
        [dependency_spec.realpath.to_s].freeze,
      )
      manifest = Struct.new(:root, :files, :packages, :warnings, :dependency_warnings).new(
        root.realpath,
        [workspace_spec.realpath.to_s, dependency_spec.realpath.to_s].freeze,
        [package].freeze,
        [],
        [],
      )
      manifest.define_singleton_method(:workspace_path?) do |path|
        RubyLens::Paths.inside?(path, root.realpath)
      end
      manifest.define_singleton_method(:relative_workspace_path) do |path|
        Pathname(path).realpath.relative_path_from(root.realpath).to_s
      rescue ArgumentError, Errno::ENOENT
        nil
      end
      manifest.define_singleton_method(:package_index_for) do |path|
        Pathname(path).realpath == dependency_spec.realpath ? 0 : nil
      end

      snapshot = RubyLens::Index::RubydexAdapter.new(manifest).index
      package_row = snapshot.fetch("packages").fetch(0)

      assert_equal(["RSpec example group #000001"], snapshot.fetch("namespace_names"))
      assert_equal(1, snapshot.fetch("category_stats").fetch("tests").fetch(2))
      assert_equal(1, package_row.fetch("declarations").length)
      refute_empty(package_row.fetch("declarations"))
      assert_empty(snapshot.fetch("constant_reference_links"))
    end
  end

  def test_compacts_dependency_declarations_without_embedding_their_names
    Dir.mktmpdir("rubylens-package-declarations-") do |directory|
      lib = File.join(directory, "lib")
      Dir.mkdir(lib)
      File.write(File.join(lib, "client.rb"), "class DependencyClient < Minitest::Test\nend\n")
      File.write(
        File.join(directory, "Gemfile.lock"),
        <<~LOCKFILE,
          GEM
            remote: https://rubygems.org/
            specs:
              minitest (6.0.6)

          PLATFORMS
            arm64-darwin

          DEPENDENCIES
            minitest (= 6.0.6)

          BUNDLED WITH
             4.0.1
        LOCKFILE
      )
      system("git", "-C", directory, "init", "--quiet", exception: true)
      system("git", "-C", directory, "add", "lib/client.rb", "Gemfile.lock", exception: true)

      snapshot = RubyLens::Index::RubydexAdapter.new(RubyLens::Index::Manifest.build(root: directory)).index
      package = snapshot.fetch("packages").find { |row| row.fetch("name") == "minitest" }

      assert(package)
      refute_empty(package.fetch("declarations"))
      assert(package.fetch("declarations").all? { |row| row.length == 7 && row.all?(Integer) })
      refute_includes(JSON.generate(snapshot), directory)
      refute_includes(JSON.generate(snapshot), "Minitest::Test")
    end
  end
end
