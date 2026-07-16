# frozen_string_literal: true

require_relative "test_helper"

class RubydexAdapterTest < Minitest::Test
  include SnapshotHelpers

  RSPEC_FIXTURE = ROOT.join("test/fixtures/rspec_repo")

  def test_does_not_accept_a_dependency_row_limit
    assert_raises(ArgumentError) { RubyLens::Index::RubydexAdapter.new(dependency_row_limit: 1) }
  end

  def test_collects_every_eligible_dependency_row
    declarations = 30.times.map do |index|
      [index % 2, [index % 2, index, 1, index % 3, index % 5, index % 7, index % 11], index % 4]
    end
    manifest = Struct.new(:packages).new([Object.new, Object.new])
    adapter = RubyLens::Index::RubydexAdapter.new
    adapter.define_singleton_method(:model_eligible_declaration?) { |_declaration| true }
    adapter.define_singleton_method(:namespace?) { |_declaration| false }
    adapter.define_singleton_method(:collect_category_stat) { |_stats, _declaration, _manifest| }
    adapter.define_singleton_method(:collect_dependency_declaration) do |aggregation, declaration, _manifest|
      package_index, row, construct_index = declaration
      aggregation.add(package_index:, row:, construct_index:)
    end

    aggregation = adapter.send(:collect_declarations, declarations, manifest).fetch(:dependency_aggregation)
    packages = aggregation.packages

    assert_equal(30, packages.sum { |package| package.fetch(:declarations).length })
    assert_equal([15, 15], packages.map { |package| package.fetch(:declaration_count) })
    assert_equal([29, 1, 2, 4, 6, 10], aggregation.signal_maxima)
  end

  def test_real_adapter_returns_hover_identity_without_paths_or_source
    manifest = RubyLens::Index::Manifest.build(root: FIXTURE)
    adapter = RubyLens::Index::RubydexAdapter.new
    snapshot = adapter.index(manifest)
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
    assert_nil(adapter.instance_variable_get(:@source_path_cache))
    assert_nil(adapter.instance_variable_get(:@workspace_location_cache))
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
      adapter = RubyLens::Index::RubydexAdapter.new

      assert(adapter.send(:model_eligible_declaration?, direct_singleton))
      refute(adapter.send(:model_eligible_declaration?, nested_singleton))
      refute(adapter.send(:model_eligible_declaration?, todo))
      refute(adapter.send(:model_eligible_declaration?, todo_singleton))
      assert(adapter.send(:model_eligible_declaration?, todo_owned_constant))
      anonymous.each { |declaration| refute(adapter.send(:model_eligible_declaration?, declaration)) }

      snapshot = adapter.index(RubyLens::Index::Manifest.build(root: directory))
      serialized = JSON.generate(snapshot)

      assert_equal(%w[Assigned Missing::Nested Named], snapshot.fetch("namespace_names").sort)
      assert_equal({ "core" => [3, 0, 2, 1], "tests" => [0, 0, 0, 0] }, snapshot.fetch("category_stats"))
      refute_includes(serialized, "<anonymous>")
    end
  end

  def test_models_raw_rspec_references_as_statless_nonidentifying_proxies
    manifest = RubyLens::Index::Manifest.build(root: RSPEC_FIXTURE)
    snapshot = RubyLens::Index::RubydexAdapter.new.index(manifest)
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
    adapter = RubyLens::Index::RubydexAdapter.allocate
    manifest = Struct.new(:root)

    assert_equal("IRB", adapter.send(:project_name, manifest.new(Pathname("/tmp/irb"))))
    assert_equal("RDoc", adapter.send(:project_name, manifest.new(Pathname("/tmp/rdoc"))))
  end

  def test_safe_length_uses_size_and_falls_back_to_count
    adapter = RubyLens::Index::RubydexAdapter.allocate
    sized = Object.new
    sized.define_singleton_method(:size) { 7 }
    sized.define_singleton_method(:count) { raise "count should not be called" }
    counted = Object.new
    counted.define_singleton_method(:size) { nil }
    counted.define_singleton_method(:count) { 4 }
    raised_size = Object.new
    raised_size.define_singleton_method(:size) { raise "size unavailable" }
    raised_size.define_singleton_method(:count) { 5 }

    assert_equal(7, adapter.send(:safe_length, Struct.new(:records).new(sized), :records))
    assert_equal(4, adapter.send(:safe_length, Struct.new(:records).new(counted), :records))
    assert_equal(5, adapter.send(:safe_length, Struct.new(:records).new(raised_size), :records))
  end

  def test_location_caches_are_cleared_when_indexing_fails
    adapter = RubyLens::Index::RubydexAdapter.new(graph_factory: ->(_root) { raise "index failed" })
    manifest = Struct.new(:root).new(Pathname("/tmp/example"))

    assert_raises(RuntimeError) { adapter.index(manifest) }
    assert_nil(adapter.instance_variable_get(:@source_path_cache))
    assert_nil(adapter.instance_variable_get(:@workspace_location_cache))
    assert_nil(adapter.instance_variable_get(:@indexed_package_document_paths))
  end

  def test_collects_declarations_without_materializing_the_enumerable
    declarations = Object.new
    declarations.define_singleton_method(:each) { |_block = nil, &block| [].each(&block) }
    declarations.define_singleton_method(:to_a) { raise "must stream declarations" }
    manifest = Struct.new(:packages).new([])

    collected = RubyLens::Index::RubydexAdapter.new.send(:collect_declarations, declarations, manifest)

    assert_empty(collected.fetch(:workspace_records))
    assert_equal({ "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] }, collected.fetch(:category_stats))
    assert_empty(collected.fetch(:dependency_aggregation).packages)
  end

  def test_dependency_extraction_failure_cannot_silently_undercount
    declaration = Object.new
    declaration.define_singleton_method(:definitions) { raise "broken definitions" }
    manifest = Struct.new(:packages).new([Object.new])

    error = assert_raises(RuntimeError) do
      RubyLens::Index::RubydexAdapter.new.send(:collect_dependency_declaration, Object.new, declaration, manifest)
    end
    assert_equal("broken definitions", error.message)
  end

  def test_non_file_definitions_are_intentionally_ineligible_for_packages
    location = Struct.new(:uri).new("https://example.test/builtin.rbs")
    manifest = Object.new
    manifest.define_singleton_method(:package_index_for) { raise "non-file locations must not be indexed" }

    assert_nil(RubyLens::Index::RubydexAdapter.new.send(:package_index_for_location, location, manifest))
  end

  def test_package_attribution_requires_a_document_rubydex_actually_indexed
    Dir.mktmpdir("rubylens-document-authority-") do |directory|
      indexed = File.join(directory, "indexed.rb")
      absent = File.join(directory, "absent.rb")
      File.write(indexed, "Indexed = 1\n")
      File.write(absent, "Absent = 1\n")
      manifest = Object.new
      manifest.define_singleton_method(:package_index_for) { |_path| 3 }
      adapter = RubyLens::Index::RubydexAdapter.new
      adapter.instance_variable_set(:@indexed_package_document_paths, Set[indexed])

      indexed_location = Struct.new(:uri).new("file://#{indexed}")
      absent_location = Struct.new(:uri).new("file://#{absent}")
      assert_equal(3, adapter.send(:package_index_for_location, indexed_location, manifest))
      assert_nil(adapter.send(:package_index_for_location, absent_location, manifest))
    end
  end

  def test_passes_the_manifest_unique_file_list_to_rubydex_once
    captured = nil
    graph = Object.new
    graph.define_singleton_method(:index_all) { |files| captured = files; [] }
    graph.define_singleton_method(:documents) { [] }
    graph.define_singleton_method(:resolve) { self }
    graph.define_singleton_method(:check_integrity) { [] }
    graph.define_singleton_method(:declarations) { [] }
    graph.define_singleton_method(:constant_references) { [] }
    manifest = Struct.new(:root, :files, :packages, :warnings, :dependency_warnings).new(
      Pathname("/tmp/example"), ["/tmp/a.rb", "/tmp/b.rb"].freeze, [], [], []
    )

    RubyLens::Index::RubydexAdapter.new(graph_factory: ->(_root) { graph }).index(manifest)

    assert_equal(manifest.files, captured)
    assert_equal(captured.uniq, captured)
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

      snapshot = RubyLens::Index::RubydexAdapter.new.index(manifest)
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

      snapshot = RubyLens::Index::RubydexAdapter.new.index(RubyLens::Index::Manifest.build(root: directory))
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
