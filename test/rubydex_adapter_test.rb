# frozen_string_literal: true

require_relative "test_helper"

class RubydexAdapterTest < Minitest::Test
  include SnapshotHelpers

  def test_real_adapter_returns_hover_identity_without_paths_or_source
    manifest = RubyLens::Index::Manifest.build(root: FIXTURE)
    adapter = RubyLens::Index::RubydexAdapter.new
    snapshot = adapter.index(manifest)
    serialized = JSON.generate(snapshot)

    assert_equal("rubylens.snapshot.v7", snapshot.fetch("schema"))
    refute(snapshot.key?("groups"))
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

  def test_configured_snapshot_has_deterministic_ownership_exact_aggregates_and_no_paths
    with_synthetic_monorepo do |directory|
      manifest = RubyLens::Index::Manifest.build(root: directory)
      first = RubyLens::Index::RubydexAdapter.new.index(manifest)
      second = RubyLens::Index::RubydexAdapter.new.index(manifest)

      assert_equal(first, second)
      assert_equal("rubylens.snapshot.v7", first.fetch("schema"))
      assert_equal("association", first.fetch("explorer_layout"))
      assert_equal(
        [
          {
            "id" => "foundation", "name" => "Acme Foundation", "anchor_seed" => 1_412_334_502,
            "namespace_counts" => [1, 0, 0],
            "ruby_counts" => { "core" => [1, 0, 1, 1], "tests" => [0, 0, 0, 0] },
            "cross_group_namespaces" => 1,
          },
          {
            "id" => "app-acme-alpha", "name" => "Acme App · acme-alpha", "anchor_seed" => 3_723_487_693,
            "namespace_counts" => [1, 0, 1],
            "ruby_counts" => { "core" => [2, 0, 0, 0], "tests" => [0, 0, 0, 0] },
            "cross_group_namespaces" => 2,
          },
          {
            "id" => "app-acme-zeta", "name" => "Acme App · acme-zeta", "anchor_seed" => 577_949_547,
            "namespace_counts" => [1, 1, 0],
            "ruby_counts" => { "core" => [1, 0, 0, 0], "tests" => [1, 0, 0, 0] },
            "cross_group_namespaces" => 1,
          },
          {
            "id" => "ungrouped", "name" => "Other", "anchor_seed" => 178_442_524,
            "namespace_counts" => [1, 0, 0],
            "ruby_counts" => { "core" => [1, 0, 0, 0], "tests" => [0, 0, 0, 0] },
            "cross_group_namespaces" => 0,
          },
        ],
        first.fetch("groups"),
      )
      assert(first.fetch("namespaces").all? { |row| row.length == 14 && row.all?(Integer) })

      group_indexes = first.fetch("groups").each_with_index.to_h { |group, index| [group.fetch("id"), index] }
      owners = first.fetch("namespace_names").each_with_index.to_h do |name, index|
        [name, first.fetch("namespaces").fetch(index).first]
      end
      assert_equal(group_indexes.fetch("foundation"), owners.fetch("RuleTie"))
      assert_equal(group_indexes.fetch("app-acme-alpha"), owners.fetch("LexicalTie"))
      assert_equal(group_indexes.fetch("app-acme-alpha"), owners.fetch("CoreWins"))
      assert_equal(group_indexes.fetch("app-acme-zeta"), owners.fetch("TotalWins"))
      assert_equal(group_indexes.fetch("ungrouped"), owners.fetch("Unowned"))
      core_wins_row = first.fetch("namespaces").fetch(first.fetch("namespace_names").index("CoreWins"))
      assert_equal(2, core_wins_row.fetch(2))

      %w[core tests].each do |category|
        aggregate = first.fetch("groups").map { |group| group.fetch("ruby_counts").fetch(category) }
          .transpose.map(&:sum)
        assert_equal(first.fetch("category_stats").fetch(category), aggregate)
      end
      assert_equal(first.fetch("namespaces").length, first.fetch("groups").sum { |group| group.fetch("namespace_counts").sum })
      assert_equal(4, first.fetch("groups").sum { |group| group.fetch("cross_group_namespaces") })

      serialized = JSON.generate(first)
      refute_includes(serialized, directory)
      refute_includes(serialized, ".rubylens.yml")
      refute_includes(serialized, "apps/*")
      refute_includes(serialized, "ownership.rb")
      refute_includes(serialized, "file://")

      art = RubyLens::ArtModelBuilder.new(seed: 12).build(first)
      assert_equal("rubylens.art.v9", art.fetch("schema"))
      assert_equal(first.fetch("namespaces").length, art.dig("totals", "renderedNamespaces"))
    end
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

  def test_high_fanout_references_collapse_to_aggregated_integer_edges
    location = Struct.new(:uri, :start_line, :start_column, :end_line, :end_column)
    definition = Struct.new(:location)
    target = Struct.new(:name, :ordinal)
    reference = Struct.new(:declaration, :location)
    source_location = location.new("file:///workspace/source.rb", 0, 0, 500, 0)
    workspace = {
      records: [[Struct.new(:name).new("Source"), [definition.new(source_location)]]],
      ordinal_by_name: { "Source" => 0 },
    }
    references = 64.times.flat_map do |ordinal|
      declaration = target.new("Target#{ordinal}", ordinal + 1)
      3.times.flat_map do |line|
        occurrence = reference.new(declaration, location.new(source_location.uri, line + 1, 2, line + 1, 8))
        Array.new(5, occurrence)
      end
    end
    graph = Struct.new(:constant_references).new(references)
    adapter = RubyLens::Index::RubydexAdapter.new
    adapter.define_singleton_method(:workspace_location?) { |_location, _manifest| true }
    adapter.define_singleton_method(:route_target) { |declaration, _manifest, _ordinals| [0, declaration.ordinal] }

    data = adapter.send(:workspace_reference_data, graph, Object.new, workspace)

    assert_equal(64, data.fetch(:routes).length)
    assert(data.fetch(:routes).all? { |row| row.length == 4 && row.all?(Integer) })
    assert(data.fetch(:routes).all? { |row| row.last == 3 })
  end

  def test_dense_single_file_source_lookup_uses_an_index_instead_of_scanning_every_range
    adapter = RubyLens::Index::RubydexAdapter.new
    range_count = 2_048
    ranges = range_count.times.map { |index| [index * 2, 0, index * 2, 20, index] }
    comparisons = 0
    contains = adapter.method(:source_range_contains?)
    adapter.define_singleton_method(:source_range_contains?) do |container, candidate|
      comparisons += 1
      contains.call(container, candidate)
    end
    uri = "file:///workspace/dense.rb"
    source_ranges = { uri => adapter.send(:index_source_ranges, ranges) }

    actual = range_count.times.map do |index|
      adapter.send(:source_namespace_ordinal, uri, [index * 2, 2, index * 2, 8], source_ranges)
    end

    assert_equal((0...range_count).to_a, actual)
    assert_operator(comparisons, :<, range_count * 3)
  end

  def test_source_lookup_prefers_the_innermost_containing_namespace
    adapter = RubyLens::Index::RubydexAdapter.new
    uri = "file:///workspace/nested.rb"
    ranges = adapter.send(
      :index_source_ranges,
      [[0, 0, 20, 0, 1], [5, 2, 15, 0, 2], [5, 2, 10, 0, 3], [6, 0, 12, 0, 4]],
    )

    assert_equal(4, adapter.send(:source_namespace_ordinal, uri, [7, 0, 8, 0], { uri => ranges }))
    assert_nil(adapter.send(:source_namespace_ordinal, uri, [21, 0, 22, 0], { uri => ranges }))
  end

  def test_visual_declaration_filter_uses_real_rubydex_shapes
    with_declaration_shapes do |_directory, _source_path, _graph, declarations|
      adapter = RubyLens::Index::RubydexAdapter.new
      named = declarations.find { |declaration| declaration.name == "Named" }
      assigned = declarations.find { |declaration| declaration.name == "Assigned" }
      todo_owned = declarations.find { |declaration| declaration.name == "Missing::Nested" }
      todo = declarations.find { |declaration| declaration.is_a?(Rubydex::Todo) && declaration.name == "Missing" }
      anonymous = declarations.select { |declaration| declaration.name.include?("<anonymous>") }
      first_level = declarations.find { |declaration| declaration.name == "Named::<Named>" }
      nested = declarations.find { |declaration| declaration.name == "Named::<Named>::<<Named>>" }
      nested_method = declarations.find { |declaration| declaration.name.end_with?("#nested_meta_method()") }

      [named, assigned, todo_owned, first_level, nested_method].each do |declaration|
        assert(adapter.send(:model_eligible_declaration?, declaration), "expected #{declaration&.name} to remain eligible")
      end
      [todo, nested, *anonymous].each do |declaration|
        refute(adapter.send(:model_eligible_declaration?, declaration), "expected #{declaration&.name} to be filtered")
      end
      refute(adapter.send(:model_eligible_declaration?, Struct.new(:name).new(nil)))
      refute(adapter.send(:model_eligible_declaration?, Struct.new(:name).new("")))
      broken = Object.new
      broken.define_singleton_method(:name) { raise "broken declaration name" }
      assert_raises(RuntimeError) { adapter.send(:model_eligible_declaration?, broken) }
      ordinary = Object.new
      ordinary.define_singleton_method(:definitions) { raise "ordinary declarations must not scan tombstones" }
      tombstones = []
      assert_nil(adapter.send(:append_anonymous_workspace_namespace_definitions, tombstones, ordinary, Object.new, "Named"))
      assert_empty(tombstones)

      ordinals = { "Named" => 0 }
      assert_equal([0, 0], adapter.send(:route_target, named, Object.new, ordinals))
      assert_equal([0, 0], adapter.send(:route_target, first_level, Object.new, ordinals))
      [todo, nested, *anonymous].each do |declaration|
        assert_nil(adapter.send(:route_target, declaration, Object.new, ordinals))
      end
    end
  end

  def test_filters_declarations_before_workspace_and_dependency_aggregation
    with_declaration_shapes do |directory, source_path, graph, _declarations|
      manifest = RubyLens::Index::Manifest.build(root: directory)
      adapter = RubyLens::Index::RubydexAdapter.new
      snapshot = adapter.index(manifest)

      assert_equal(%w[Assigned Missing::Nested Named], snapshot.fetch("namespace_names").sort)
      assert_equal({ "core" => [3, 0, 2, 1], "tests" => [0, 0, 0, 0] }, snapshot.fetch("category_stats"))
      refute_includes(JSON.generate(snapshot), "<anonymous>")

      package_manifest = Object.new
      package_manifest.define_singleton_method(:packages) { [Object.new] }
      package_manifest.define_singleton_method(:workspace_path?) { |_path| false }
      package_manifest.define_singleton_method(:package_index_for) { |path| File.expand_path(path) == source_path ? 0 : nil }
      collected = RubyLens::Index::RubydexAdapter.new.send(:collect_declarations, graph.declarations, package_manifest)
      package = collected.fetch(:dependency_aggregation).packages.fetch(0)

      assert_equal(7, package.fetch(:declaration_count))
      assert_equal([3, 0, 2, 1], package.fetch(:ruby_counts))
      assert_equal(7, package.fetch(:declarations).length)
      assert_includes(package.fetch(:declarations).map(&:first), 2, "first-level singleton class remains eligible")
      retained_maxima = (1..6).map { |column| package.fetch(:declarations).map { |row| row.fetch(column) }.max }
      assert_equal(retained_maxima, collected.fetch(:dependency_aggregation).signal_maxima)

      workspace_collected = RubyLens::Index::RubydexAdapter.new.send(:collect_declarations, graph.declarations, manifest)
      assert_equal(2, workspace_collected.fetch(:workspace_range_tombstones).length)
    end
  end

  def test_anonymous_range_tombstone_blocks_outer_attribution_but_named_inner_wins
    adapter = RubyLens::Index::RubydexAdapter.new
    uri = "file:///workspace/anonymous.rb"
    ranges = adapter.send(
      :index_source_ranges,
      [[0, 0, 30, 0, 1], [5, 0, 25, 0, nil], [10, 0, 15, 0, 2]],
    )
    source_ranges = { uri => ranges }

    assert_nil(adapter.send(:source_namespace_ordinal, uri, [7, 0, 7, 5], source_ranges))
    assert_equal(2, adapter.send(:source_namespace_ordinal, uri, [12, 0, 12, 5], source_ranges))
    assert_nil(adapter.send(:source_namespace_ordinal, uri, [18, 0, 18, 5], source_ranges))
    assert_equal(1, adapter.send(:source_namespace_ordinal, uri, [27, 0, 27, 5], source_ranges))
  end

  def test_anonymous_workspace_source_does_not_fall_back_to_visible_outer_namespace
    Dir.mktmpdir("rubylens-anonymous-source-") do |directory|
      directory = File.realpath(directory)
      source_path = File.join(directory, "anonymous_source.rb")
      File.write(source_path, <<~RUBY)
        class Outer
          Class.new do
            Target
            class NamedInsideAnonymous
              Target
            end
          end
        end

        class Target; end
      RUBY
      system("git", "-C", directory, "init", "--quiet", exception: true)
      system("git", "-C", directory, "add", "anonymous_source.rb", exception: true)

      snapshot = RubyLens::Index::RubydexAdapter.new.index(RubyLens::Index::Manifest.build(root: directory))
      names = snapshot.fetch("namespace_names")
      routes = snapshot.fetch("reference_routes").map do |source, target_kind, target, count|
        [names.fetch(source), target_kind, names.fetch(target), count]
      end

      assert_includes(names, "Outer")
      assert_includes(names, "Outer::NamedInsideAnonymous")
      refute(names.any? { |name| name.include?("<anonymous>") })
      assert_equal([["Outer::NamedInsideAnonymous", 0, "Target", 1]], routes)
    end
  end

  def test_configured_group_totals_cannot_silently_undercount
    groups = [{ "ruby_counts" => { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] } }]
    category_stats = { "core" => [1, 0, 0, 0], "tests" => [0, 0, 0, 0] }

    error = assert_raises(RubyLens::Error) do
      RubyLens::Index::RubydexAdapter.new.send(:validate_group_totals!, groups, category_stats)
    end
    assert_equal("group core aggregates do not reconcile with category totals", error.message)
    empty_stats = { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] }
    RubyLens::Index::RubydexAdapter.new.send(:validate_group_totals!, [], empty_stats)
  end

  def test_location_caches_are_cleared_when_indexing_fails
    adapter = RubyLens::Index::RubydexAdapter.new(graph_factory: ->(_root) { raise "index failed" })
    manifest = Struct.new(:root).new(Pathname("/tmp/example"))

    assert_raises(RuntimeError) { adapter.index(manifest) }
    assert_nil(adapter.instance_variable_get(:@location_path_cache))
    assert_nil(adapter.instance_variable_get(:@workspace_location_cache))
  end

  def test_collects_declarations_without_materializing_the_enumerable
    declarations = Object.new
    declarations.define_singleton_method(:each) { |_block = nil, &block| [].each(&block) }
    declarations.define_singleton_method(:to_a) { raise "must stream declarations" }
    manifest = Struct.new(:packages).new([])

    collected = RubyLens::Index::RubydexAdapter.new.send(:collect_declarations, declarations, manifest)

    assert_empty(collected.fetch(:workspace_records))
    assert_empty(collected.fetch(:workspace_range_tombstones))
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
      source = snapshot.fetch("namespace_names").index("DependencyClient")
      package_index = snapshot.fetch("packages").index { |row| row.fetch("name") == "minitest" }
      package = snapshot.fetch("packages").fetch(package_index)

      assert(source)
      assert(package)
      assert_equal(package.fetch("declarations").length, package.fetch("declaration_count"))
      refute_empty(package.fetch("declarations"))
      assert(package.fetch("declarations").all? { |row| row.length == 7 && row.all?(Integer) })
      assert_equal([[source, 1, package_index, 2]], snapshot.fetch("reference_routes"))
      refute_includes(JSON.generate(snapshot), directory)
      refute_includes(JSON.generate(snapshot), "Minitest::Test")
    end
  end


  private

  def with_declaration_shapes
    Dir.mktmpdir("rubylens-declaration-shapes-") do |directory|
      directory = File.realpath(directory)
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
        class Missing::Nested; end
      RUBY
      system("git", "-C", directory, "init", "--quiet", exception: true)
      system("git", "-C", directory, "add", "shapes.rb", exception: true)
      graph = Rubydex::Graph.new(workspace_path: directory)
      assert_empty(graph.index_all([source_path]))
      graph.resolve
      yield directory, source_path, graph, graph.declarations.to_a
    end
  end

  def with_synthetic_monorepo
    Dir.mktmpdir("rubylens-synthetic-monorepo-") do |directory|
      files = {
        "components/acme-foundation/lib/ownership.rb" => <<~RUBY,
          class RuleTie
            FOUNDATION = true
            def foundation; end
          end
        RUBY
        "apps/acme-alpha/lib/ownership.rb" => <<~RUBY,
          class LexicalTie; end
          class CoreWins; end
          class TotalWins; end
        RUBY
        "apps/acme-zeta/lib/ownership.rb" => <<~RUBY,
          class RuleTie; end
          class LexicalTie; end
          class TotalWins; end
          class TotalWins; end
        RUBY
        "apps/acme-zeta/test/core_wins_test.rb" => "class CoreWins; end\nclass SyntheticTestOnly; end\n",
        "misc/unowned.rb" => "class Unowned; end\n",
      }
      files.each do |relative, contents|
        path = File.join(directory, relative)
        FileUtils.mkdir_p(File.dirname(path))
        File.write(path, contents)
      end
      File.write(File.join(directory, ".rubylens.yml"), <<~YAML)
        version: 1
        boundaries:
          groups:
            - id: foundation
              label: Acme Foundation
              paths: [components/acme-foundation/**]
            - each: apps/*
              id_prefix: app
              label: "Acme App · %{basename}"
          ungrouped:
            mode: group
            label: Other
      YAML
      system("git", "-C", directory, "init", "--quiet", exception: true)
      system("git", "-C", directory, "add", ".", exception: true)
      yield directory
    end
  end
end
