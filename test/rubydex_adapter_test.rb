# frozen_string_literal: true

require_relative "test_helper"

class RubydexAdapterTest < Minitest::Test
  include SnapshotHelpers

  def test_real_adapter_returns_hover_identity_without_paths_or_source
    manifest = RubyLens::Index::Manifest.build(root: FIXTURE)
    adapter = RubyLens::Index::RubydexAdapter.new
    snapshot = adapter.index(manifest)
    serialized = JSON.generate(snapshot)

    assert_equal("rubylens.snapshot.v3", snapshot.fetch("schema"))
    assert_equal("Tiny Repo", snapshot.fetch("project_name"))
    assert_equal(9, snapshot.fetch("namespaces").length)
    assert_equal(9, snapshot.fetch("namespace_names").length)
    assert_equal(9, snapshot.fetch("components").sum)
    assert(snapshot.fetch("namespaces").all? { |row| row.length == 14 && row.all?(Integer) })
    assert_equal({ "core" => [4, 4, 3, 1], "tests" => [1, 0, 0, 0] }, snapshot.fetch("category_stats"))
    assert_includes(snapshot.fetch("namespace_names"), "Demo::Order")
    order_index = snapshot.fetch("namespace_names").index("Demo::Order")
    assert_equal([1, 0, 2, 1, 1], snapshot.fetch("namespaces").fetch(order_index).last(5))
    order_test_index = snapshot.fetch("namespace_names").index("Demo::OrderTest")
    assert_equal(0, snapshot.fetch("namespaces").fetch(order_test_index).last)
    route_map = snapshot.fetch("reference_routes").to_h do |source, target_kind, target, count|
      assert_equal(0, target_kind)
      [[snapshot.fetch("namespace_names").fetch(source), snapshot.fetch("namespace_names").fetch(target)], count]
    end
    assert_equal(
      {
        ["Demo::Order", "Demo"] => 2,
        ["Demo::Order", "Demo::Auditable"] => 1,
        ["Demo::Order", "Demo::Base"] => 3,
        ["Demo::Order", "Demo::Helper"] => 2,
        ["Demo::Order", "Demo::Trackable"] => 3,
        ["Demo::OrderTest", "Demo::Order"] => 1,
      },
      route_map,
    )
    assert(snapshot.fetch("reference_routes").all? { |row| row.length == 4 && row.all?(Integer) })
    assert_equal(
      { "deduplicated" => 2, "resolved_workspace" => 16, "routed_occurrences" => 12, "routes" => 6, "self" => 2 },
      snapshot.fetch("reference_route_counts"),
    )
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

  def test_source_namespace_range_prefers_the_innermost_definition
    adapter = RubyLens::Index::RubydexAdapter.allocate
    uri = "file:///tmp/nested.rb"

    assert_equal(
      4,
      adapter.send(
        :source_namespace_ordinal,
        uri,
        [7, 0, 8, 0],
        { uri => [[0, 0, 20, 0, 1], [5, 2, 15, 0, 2], [5, 2, 10, 0, 3], [6, 0, 12, 0, 4]] },
      ),
    )
    assert_equal(
      3,
      adapter.send(
        :source_namespace_ordinal,
        uri,
        [7, 0, 8, 0],
        { uri => [[5, 2, 15, 0, 2], [5, 2, 10, 0, 3]] },
      ),
    )
    assert_equal(
      7,
      adapter.send(
        :source_namespace_ordinal,
        uri,
        [5, 4, 5, 10],
        { uri => [[5, 0, 5, 20, 5], [5, 2, 5, 20, 6], [5, 2, 5, 15, 7]] },
      ),
    )
    assert_nil(adapter.send(:source_namespace_ordinal, uri, [21, 0, 22, 0], { uri => [[0, 0, 20, 0, 1]] }))
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
  end

  def test_collapses_an_external_target_to_its_audited_package
    adapter = RubyLens::Index::RubydexAdapter.allocate
    location = Rubydex::Location.new(
      uri: "file:///tmp/example-gem/lib/example/client.rb",
      start_line: 0,
      start_column: 0,
      end_line: 0,
      end_column: 6,
    )
    definition = Struct.new(:location).new(location)
    declaration = Struct.new(:name, :owner, :definitions).new("Example::Client", nil, [definition])
    manifest = Object.new
    manifest.define_singleton_method(:package_index_for) do |path|
      path.include?("/example-gem/") ? 3 : nil
    end

    assert_equal([1, 3], adapter.send(:route_target, declaration, manifest, {}))
  end

  def test_routes_a_real_resolved_dependency_reference_to_its_package
    Dir.mktmpdir("rubylens-routed-package-") do |directory|
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
      source = snapshot.fetch("namespace_names").index("DependencyClient")
      package = snapshot.fetch("packages").index { |row| row.fetch("name") == "minitest" }

      assert(source)
      assert(package)
      assert_equal([[source, 1, package, 2]], snapshot.fetch("reference_routes"))
      assert(
        snapshot.fetch("packages").fetch(package).fetch("declarations").all? do |row|
          row.length == 7 && row.all?(Integer)
        end,
      )
      refute_includes(JSON.generate(snapshot), directory)
      refute_includes(JSON.generate(snapshot), "Minitest::Test")
    end
  end
end
