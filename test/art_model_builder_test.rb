# frozen_string_literal: true

require_relative "test_helper"

class ArtModelBuilderTest < Minitest::Test
  def test_builds_one_configured_host_with_an_exact_budget_and_contiguous_regions
    snapshot = configured_snapshot
    builder = RubyLens::ArtModelBuilder.new(seed: 12, namespace_budget: 3)
    model = builder.build(snapshot)
    reordered = snapshot.merge(
      "namespace_names" => snapshot.fetch("namespace_names").reverse,
      "namespaces" => snapshot.fetch("namespaces").reverse,
    )

    assert_equal(model, builder.build(reordered))
    assert_equal("rubylens.art.v9", model.fetch("schema"))
    assert_equal(
      {
        "namespaces" => 4, "renderedNamespaces" => 3, "regions" => 2, "packages" => 0,
        "dependencyStars" => 0, "renderedDependencyStars" => 0,
      },
      model.fetch("totals"),
    )
    assert_equal([[0, 2], [2, 1]], model.fetch("regionRanges"))
    assert_equal([[2, 2], [1, 1]], model.fetch("regionLods"))
    assert_equal(["System Alpha", "System Beta"], model.fetch("regionNames"))
    assert(model.fetch("regions").all? { |row| row.length == 13 && row.all?(Integer) })
    assert(model.fetch("regionBounds").all? { |row| row.length == 4 && row.all?(Integer) })
    assert(model.fetch("regionCentroids").all? { |row| row.length == 3 && row.all?(Integer) })
    assert_equal((RubyLens::Model::WorkspaceLayout.radius(3) * 1_000).round, model.fetch("workspaceRadius"))
    assert_equal([3, 3, 1, 2, 1, 2], model.fetch("workspaceDensity"))
    refute(model.key?("groupAnchors"))
    refute(model.key?("groupRadii"))
    refute(model.key?("explorerAnchors"))

    model.fetch("regionRanges").each_with_index do |(first, length), region_index|
      rows = model.fetch("namespaces").slice(first, length)
      assert(rows.all? { |row| row.fetch(1) == region_index })
      source_core, source_tests, source_mixed = snapshot.fetch("groups").fetch(region_index).fetch("namespace_counts")
      assert_equal(source_core + source_mixed, rows.reject { |row| row.fetch(3) == 1 }.sum { |row| row.fetch(15) })
      assert_equal(source_tests, rows.select { |row| row.fetch(3) == 1 }.sum { |row| row.fetch(15) })
    end

    assert(model.fetch("namespaces").all? { |row| row.length == 16 && row.all?(Integer) })
    serialized = JSON.generate(model)
    refute_includes(serialized, "private-alpha")
    refute_includes(serialized, "apps/alpha/**")
  end

  def test_unconfigured_projects_use_the_same_schema_budget_and_host_radius
    snapshot = unconfigured_snapshot
    builder = RubyLens::ArtModelBuilder.new(seed: 12, namespace_budget: 3)
    model = builder.build(snapshot)
    reordered = snapshot.merge(
      "namespace_names" => snapshot.fetch("namespace_names").reverse,
      "namespaces" => snapshot.fetch("namespaces").reverse,
    )

    assert_equal(model, builder.build(reordered))
    assert_equal("rubylens.art.v9", model.fetch("schema"))
    assert_equal(4, model.dig("totals", "namespaces"))
    assert_equal(3, model.dig("totals", "renderedNamespaces"))
    assert_equal(1, model.dig("totals", "regions"))
    assert_equal(3, model.fetch("regionRanges").sum(&:last))
    assert_equal((RubyLens::Model::WorkspaceLayout.radius(3) * 1_000).round, model.fetch("workspaceRadius"))
    rows = model.fetch("namespaces")
    assert(rows.all? { |row| row.fetch(1).zero? })
    assert_equal(3, rows.reject { |row| row.fetch(3) == 1 }.sum { |row| row.fetch(15) })
    assert_equal(1, rows.select { |row| row.fetch(3) == 1 }.sum { |row| row.fetch(15) })
    refute(model.key?("regionNames"))
  end

  def test_uses_exact_namespace_signal_domains_at_every_budget
    snapshot = configured_snapshot
    snapshot.fetch("namespace_names") << "Beta::Outlier"
    snapshot.fetch("namespaces") << [1, 0, 0, 99, 98, 97, 96, 95, 94, 1, 0, 0, 0, 0]
    snapshot.fetch("components")[1] += 1
    snapshot.fetch("groups")[1].fetch("namespace_counts")[0] += 1

    one = RubyLens::ArtModelBuilder.new(seed: 12, namespace_budget: 2).build(snapshot)
    all = RubyLens::ArtModelBuilder.new(seed: 12, namespace_budget: 5).build(snapshot)
    expected = RubyLens::ArtModelBuilder::SIGNAL_FIELDS.zip([99, 98, 97, 96, 95, 94]).to_h

    assert_equal(expected, one.fetch("domains"))
    assert_equal(expected, all.fetch("domains"))
  end

  def test_mid_lod_uses_the_bounded_sqrt_multiplier
    snapshot = configured_snapshot
    12.times do |index|
      snapshot.fetch("namespace_names") << "Beta::Extra#{index}"
      snapshot.fetch("namespaces") << [1, 0, 0, index, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0]
      snapshot.fetch("groups")[1].fetch("namespace_counts")[0] += 1
      snapshot.fetch("components")[1] += 1
    end

    model = RubyLens::ArtModelBuilder.new(seed: 12, namespace_budget: 16).build(snapshot)
    beta_length = model.fetch("regionRanges")[1][1]

    assert_equal([(Math.sqrt(beta_length) * 3).ceil, beta_length].min, model.fetch("regionLods")[1][0])
  end

  def test_empty_region_keeps_its_ordinal_without_affecting_host_radius
    snapshot = configured_snapshot
    snapshot.fetch("groups") << {
      "id" => "empty", "name" => "Empty", "anchor_seed" => 999,
      "namespace_counts" => [0, 0, 0],
      "ruby_counts" => { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] },
      "cross_group_namespaces" => 0,
    }
    snapshot.fetch("components") << 0

    model = RubyLens::ArtModelBuilder.new(seed: 12, namespace_budget: 4).build(snapshot)

    assert_equal([4, 0], model.fetch("regionRanges").last)
    assert_equal([0, 0], model.fetch("regionLods").last)
    assert_equal([0, 0, 0, 0], model.fetch("regionBounds").last)
    assert_equal([0, 0, 0], model.fetch("regionCentroids").last)
    assert_equal(3, model.dig("totals", "regions"))
    assert_equal((RubyLens::Model::WorkspaceLayout.radius(3) * 1_000).round, model.fetch("workspaceRadius"))
  end

  def test_tests_only_workspace_uses_exact_test_population_for_radius
    snapshot = unconfigured_snapshot
    snapshot["namespaces"].each { |row| row[2] = 1 }
    snapshot["category_stats"] = { "core" => [0, 0, 0, 0], "tests" => [2, 2, 0, 0] }

    model = RubyLens::ArtModelBuilder.new(seed: 12).build(snapshot)

    assert_equal(4, model.fetch("workspaceDensity").first)
    assert_equal((RubyLens::Model::WorkspaceLayout.radius(4) * 1_000).round, model.fetch("workspaceRadius"))
  end

  def test_caps_dependency_star_sampling_for_every_snapshot_schema
    declarations = 18_020.times.map { [2, 0, 1, 0, 0, 0, 0] }
    snapshot = empty_snapshot.merge(
      "packages" => [{
        "name" => "large-gem", "role" => 1, "location" => 1,
        "ruby_counts" => [1, 1, 18_020, 100], "declarations" => declarations,
      }],
    )

    model = RubyLens::ArtModelBuilder.new(seed: 12).build(snapshot)

    assert_equal(18_020, model.dig("totals", "dependencyStars"))
    assert_equal(18_000, model.dig("totals", "renderedDependencyStars"))
    assert_equal([1, 1, 18_020, 1, 1, 18_020, 100], model.fetch("packages").first.drop(1))
  end

  def test_preserves_exact_dependency_totals_domains_and_package_construct_counts
    snapshot = empty_snapshot.merge(
      "dependency_signal_maxima" => [99, 98, 97, 96, 95, 94],
      "packages" => [{
        "name" => "large-gem", "role" => 1, "location" => 1,
        "declaration_count" => 1_000_000, "ruby_counts" => [1, 2, 3, 4],
        "declarations" => [[0, 1, 1, 0, 0, 0, 0], [1, 2, 1, 0, 0, 0, 0]],
      }],
    )

    model = RubyLens::ArtModelBuilder.new(seed: 12).build(snapshot)

    assert_equal(1_000_000, model.dig("totals", "dependencyStars"))
    assert_equal(2, model.dig("totals", "renderedDependencyStars"))
    assert_equal([1, 1, 1_000_000, 1, 2, 3, 4], model.fetch("packages").first.drop(1))
    assert_equal(
      RubyLens::ArtModelBuilder::SIGNAL_FIELDS.zip([99, 98, 97, 96, 95, 94]).to_h,
      model.fetch("domains"),
    )
  end

  private

  def empty_snapshot
    {
      "schema" => "rubylens.snapshot.v5", "project_name" => "Empty", "components" => [],
      "namespace_names" => [], "namespaces" => [],
      "category_stats" => { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] },
      "packages" => [],
      "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
    }
  end

  def unconfigured_snapshot
    configured_snapshot.reject { |key, _value| key == "groups" }
      .merge("schema" => "rubylens.snapshot.v5", "project_name" => "Synthetic App")
  end

  def configured_snapshot
    {
      "schema" => "rubylens.snapshot.v6",
      "project_name" => "Synthetic Systems",
      "components" => [3, 1],
      "namespace_names" => %w[Alpha::One Alpha::Two Alpha::Test Beta::One],
      "namespaces" => [
        [0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0],
        [0, 1, 0, 1, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0],
        [0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0],
        [1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0],
      ],
      "category_stats" => { "core" => [2, 1, 0, 0], "tests" => [1, 0, 0, 0] },
      "dependency_signal_maxima" => [0, 0, 0, 0, 0, 0],
      "groups" => [
        {
          "id" => "private-alpha", "name" => "System Alpha", "anchor_seed" => 111,
          "namespace_counts" => [2, 1, 0],
          "ruby_counts" => { "core" => [1, 1, 0, 0], "tests" => [1, 0, 0, 0] },
          "cross_group_namespaces" => 1,
        },
        {
          "id" => "private-beta", "name" => "System Beta", "anchor_seed" => 222,
          "namespace_counts" => [1, 0, 0],
          "ruby_counts" => { "core" => [1, 0, 0, 0], "tests" => [0, 0, 0, 0] },
          "cross_group_namespaces" => 0,
        },
      ],
      "packages" => [],
      "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
    }
  end
end
