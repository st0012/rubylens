# frozen_string_literal: true

require_relative "test_helper"

class RubydexAdapterTest < Minitest::Test
  include SnapshotHelpers

  RSPEC_FIXTURE = ROOT.join("test/fixtures/rspec_repo")

  def test_collects_every_eligible_dependency_row
    location_class = Data.define(:uri) do
      def comparable_values = [uri, 0, 0, 0, 1]
    end
    definition_class = Data.define(:location)
    declaration_class = Data.define(:name, :definitions, :references)
    paths = ["/deps/alpha/lib/alpha.rb", "/deps/beta/lib/beta.rb"]
    declarations = 30.times.map do |index|
      declaration_class.new(
        "Dependency#{index}",
        [definition_class.new(location_class.new("file://#{paths.fetch(index % 2)}"))],
        Array.new(index % 7),
      )
    end
    manifest = stub(packages: [Object.new, Object.new], workspace_path?: false)
    manifest.stubs(:package_index_for).with(paths.fetch(0)).returns(0)
    manifest.stubs(:package_index_for).with(paths.fetch(1)).returns(1)
    adapter = RubyLens::Index::RubydexAdapter.new(manifest)
    adapter.instance_variable_set(:@indexed_package_document_paths, Set.new(paths))

    aggregation = adapter.send(:collect_declarations, declarations).fetch(:dependency_aggregation)
    packages = aggregation.packages

    assert_equal(30, packages.sum { |package| package.fetch(:declarations).length })
    assert_equal([15, 15], packages.map { |package| package.fetch(:declaration_count) })
    assert_equal([0, 1, 0, 0, 6, 0], aggregation.signal_maxima)
  end

  def test_real_adapter_returns_hover_identity_without_paths_or_source
    manifest = RubyLens::Index::Manifest.build(root: FIXTURE)
    snapshot = RubyLens::Index::RubydexAdapter.new(manifest).index
    serialized = JSON.generate(snapshot)

    assert_equal("rubylens.snapshot.v6", snapshot.fetch("schema"))
    assert_equal("Tiny Repo", snapshot.fetch("project_name"))
    assert_equal(9, snapshot.fetch("namespaces").length)
    assert_equal(9, snapshot.fetch("namespace_names").length)
    assert_equal(9, snapshot.fetch("components").sum)
    assert(snapshot.fetch("namespaces").all? { |row| row.length == 14 && row.all?(Integer) })
    assert_equal({ "core" => [4, 4, 3, 1], "tests" => [1, 0, 0, 0] }, snapshot.fetch("category_stats"))
    assert_equal(6, snapshot.fetch("dependency_signal_maxima").length)
    assert_empty(snapshot.fetch("dependency_systems"))
    assert_includes(snapshot.fetch("namespace_names"), "Demo::Order")
    order_index = snapshot.fetch("namespace_names").index("Demo::Order")
    assert_equal([1, 0, 2, 1, 1], snapshot.fetch("namespaces").fetch(order_index).last(5))
    order_test_index = snapshot.fetch("namespace_names").index("Demo::OrderTest")
    assert_equal(0, snapshot.fetch("namespaces").fetch(order_test_index).last)
    refute_includes(serialized, FIXTURE.to_s)
    refute_includes(serialized, "domain.rb")
    refute_includes(serialized, "PRIVATE_VALUE")
  end

  def test_filters_synthetic_declarations_before_visual_aggregation
    Dir.mktmpdir("rubylens-declaration-shapes-") do |directory|
      source_path = File.join(directory, "shapes.rb")
      File.write(source_path, <<~RUBY)
        class Named
          class << self
            def class_method; end
            class << self
              def nested_meta_method; end
            end
          end
        end

        Assigned = Class.new
        Class.new
        Module.new
        Missing::VALUE = 1
        class << Missing; end
        class Missing::Nested; end
      RUBY
      system("git", "-C", directory, "init", "--quiet", exception: true)
      system("git", "-C", directory, "add", "shapes.rb", exception: true)

      graph = Rubydex::Graph.new(workspace_path: directory)
      assert_empty(graph.index_all([source_path]))
      graph.resolve
      declarations = graph.declarations.to_a
      direct_singleton = declarations.find { |declaration| declaration.name == "Named::<Named>" }
      nested_singleton = declarations.find { |declaration| declaration.name == "Named::<Named>::<<Named>>" }
      todo = declarations.find { |declaration| declaration.is_a?(Rubydex::Todo) && declaration.name == "Missing" }
      todo_singleton = declarations.find { |declaration| declaration.name == "Missing::<Missing>" }
      todo_owned_constant = declarations.find { |declaration| declaration.name == "Missing::VALUE" }
      anonymous = declarations.select { |declaration| declaration.name.include?("<anonymous>") }
      adapter = RubyLens::Index::RubydexAdapter.new(RubyLens::Index::Manifest.build(root: directory))

      assert(adapter.send(:model_eligible_declaration?, direct_singleton))
      refute(adapter.send(:model_eligible_declaration?, nested_singleton))
      refute(adapter.send(:model_eligible_declaration?, todo))
      refute(adapter.send(:model_eligible_declaration?, todo_singleton))
      assert(adapter.send(:model_eligible_declaration?, todo_owned_constant))
      anonymous.each { |declaration| refute(adapter.send(:model_eligible_declaration?, declaration)) }

      snapshot = adapter.index
      serialized = JSON.generate(snapshot)

      assert_equal(%w[Assigned Missing::Nested Named], snapshot.fetch("namespace_names").sort)
      assert_equal({ "core" => [3, 0, 2, 1], "tests" => [0, 0, 0, 0] }, snapshot.fetch("category_stats"))
      refute_includes(serialized, "<anonymous>")
    end
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
    assert(rows.all? { |_name, row| row.length == 14 && row.all?(Integer) })
    assert(rows.all? { |_name, row| row[1] == 0 && row[2] == 1 })
    assert(rows.all? { |_name, row| row.drop(3).all?(&:zero?) })
    assert_equal(rows.length, rows.map(&:first).uniq.length)
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

  def test_safe_length_uses_size_and_falls_back_to_count
    adapter = RubyLens::Index::RubydexAdapter.new(stub)
    sized = stub(size: 7)
    sized.expects(:count).never
    counted = stub(size: nil, count: 4)
    raised_size = stub(count: 5)
    raised_size.stubs(:size).raises("size unavailable")

    assert_equal(7, adapter.send(:safe_length, stub(records: sized), :records))
    assert_equal(4, adapter.send(:safe_length, stub(records: counted), :records))
    assert_equal(5, adapter.send(:safe_length, stub(records: raised_size), :records))
  end

  def test_collects_declarations_without_materializing_the_enumerable
    declarations = stub(each: nil)
    declarations.expects(:to_a).never

    collected = RubyLens::Index::RubydexAdapter.new(stub(packages: [])).send(:collect_declarations, declarations)

    assert_empty(collected.fetch(:workspace_records))
    assert_equal({ "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] }, collected.fetch(:category_stats))
    assert_empty(collected.fetch(:dependency_aggregation).packages)
  end

  def test_dependency_extraction_failure_cannot_silently_undercount
    declaration = stub(name: "Broken")
    declaration.stubs(:definitions).raises("broken definitions")
    manifest = stub(packages: [Object.new])

    error = assert_raises(RuntimeError) do
      RubyLens::Index::RubydexAdapter.new(manifest).send(:collect_declarations, [declaration])
    end
    assert_equal("broken definitions", error.message)
  end

  def test_non_file_definitions_are_intentionally_ineligible_for_packages
    location = Struct.new(:uri).new("https://example.test/builtin.rbs")
    manifest = stub
    manifest.expects(:package_index_for).never

    assert_nil(RubyLens::Index::RubydexAdapter.new(manifest).send(:package_index_for_location, location))
  end

  def test_package_attribution_requires_a_document_rubydex_actually_indexed
    Dir.mktmpdir("rubylens-document-authority-") do |directory|
      indexed = File.join(directory, "indexed.rb")
      absent = File.join(directory, "absent.rb")
      File.write(indexed, "Indexed = 1\n")
      File.write(absent, "Absent = 1\n")
      manifest = stub(package_index_for: 3)
      adapter = RubyLens::Index::RubydexAdapter.new(manifest)
      adapter.instance_variable_set(:@indexed_package_document_paths, Set[indexed])

      indexed_location = Struct.new(:uri).new("file://#{indexed}")
      absent_location = Struct.new(:uri).new("file://#{absent}")
      assert_equal(3, adapter.send(:package_index_for_location, indexed_location))
      assert_nil(adapter.send(:package_index_for_location, absent_location))
    end
  end

  def test_indexes_the_exact_git_selected_manifest_once
    graph = stub(documents: [], resolve: nil, check_integrity: [], declarations: [], constant_references: [])
    manifest = Struct.new(:root, :files, :packages, :warnings, :dependency_warnings).new(
      Pathname("/tmp/example"), ["/tmp/a.rb", "/tmp/b.rb"].freeze, [], [], []
    )

    Rubydex::Graph.expects(:new).with(workspace_path: manifest.root.to_s).returns(graph)
    graph.expects(:index_all).with(manifest.files).returns([])
    RubyLens::Index::RubydexAdapter.new(manifest).index

    assert_equal(manifest.files.uniq, manifest.files)
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
      assert_equal(1, package_row.fetch("declaration_count"))
      refute_empty(package_row.fetch("declarations"))
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
      assert_equal(package.fetch("declarations").length, package.fetch("declaration_count"))
      refute_empty(package.fetch("declarations"))
      assert(package.fetch("declarations").all? { |row| row.length == 7 && row.all?(Integer) })
      refute_includes(JSON.generate(snapshot), directory)
      refute_includes(JSON.generate(snapshot), "Minitest::Test")
    end
  end
end
