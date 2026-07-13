# frozen_string_literal: true

require_relative "test_helper"

class RubydexAdapterTest < Minitest::Test
  include SnapshotHelpers

  def test_real_adapter_returns_hover_identity_without_paths_or_source
    manifest = RubyLens::Index::Manifest.build(root: FIXTURE)
    adapter = RubyLens::Index::RubydexAdapter.new
    snapshot = adapter.index(manifest)
    serialized = JSON.generate(snapshot)

    assert_equal("rubylens.snapshot.v5", snapshot.fetch("schema"))
    assert_equal("Tiny Repo", snapshot.fetch("project_name"))
    assert_equal(9, snapshot.fetch("namespaces").length)
    assert_equal(9, snapshot.fetch("namespace_names").length)
    assert_equal(9, snapshot.fetch("components").sum)
    assert(snapshot.fetch("namespaces").all? { |row| row.length == 14 && row.all?(Integer) })
    assert_equal({ "core" => [4, 4, 3, 1], "tests" => [1, 0, 0, 0] }, snapshot.fetch("category_stats"))
    assert_equal(6, snapshot.fetch("dependency_signal_maxima").length)
    assert_includes(snapshot.fetch("namespace_names"), "Demo::Order")
    order_index = snapshot.fetch("namespace_names").index("Demo::Order")
    assert_equal([1, 0, 2, 1, 1], snapshot.fetch("namespaces").fetch(order_index).last(5))
    order_test_index = snapshot.fetch("namespace_names").index("Demo::OrderTest")
    assert_equal(0, snapshot.fetch("namespaces").fetch(order_test_index).last)
    refute_includes(serialized, FIXTURE.to_s)
    refute_includes(serialized, "domain.rb")
    refute_includes(serialized, "PRIVATE_VALUE")
    assert_nil(adapter.instance_variable_get(:@location_path_cache))
    assert_nil(adapter.instance_variable_get(:@workspace_location_cache))
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
    assert_nil(adapter.instance_variable_get(:@location_path_cache))
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
