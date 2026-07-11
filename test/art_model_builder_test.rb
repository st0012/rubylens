# frozen_string_literal: true

require_relative "test_helper"

class ArtModelBuilderTest < Minitest::Test
  def test_builds_a_deterministic_local_art_contract_with_hover_identity
    snapshot = {
      "project_name" => "Demo",
      "components" => [2],
      "namespace_names" => ["Demo::Core", "Demo::TestCase"],
      "namespaces" => [
        [0, 0, 0, 3, 1, 0, 2, 4, 5, 1, 0, 3, 2, 4],
        [0, 1, 1, 1, 2, 1, 0, 3, 2, 0, 1, 1, 0, 0],
      ],
      "category_stats" => { "core" => [1, 1, 4, 2], "tests" => [0, 1, 1, 0] },
      "packages" => [
        {
          "name" => "example-gem",
          "role" => 0,
          "location" => 1,
          "ruby_counts" => [2, 1, 4, 3],
          "declarations" => [[0, 2, 1, 0, 1, 3, 4]],
        },
      ],
      "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
    }
    builder = RubyLens::ArtModelBuilder.new(seed: 12)

    first = builder.build(snapshot)
    second = builder.build(snapshot)

    assert_equal(first, second)
    assert_equal("rubylens.art.v7", first.fetch("schema"))
    assert_equal("Demo", first.fetch("projectName"))
    assert_equal(2, first.dig("totals", "namespaces"))
    assert_equal(1, first.dig("totals", "dependencyStars"))
    assert_equal(1, first.dig("totals", "renderedDependencyStars"))
    assert_equal({ "core" => [1, 1, 4, 2], "tests" => [0, 1, 1, 0] }, first.fetch("categoryStats"))
    assert_equal(["Demo::Core", "Demo::TestCase"].sort, first.fetch("namespaceNames").sort)
    assert_equal(["example-gem"], first.fetch("packageNames"))
    assert_equal([0, 1, 1, 2, 1, 4, 3], first.fetch("packages").first.drop(1))
    refute(first.key?("dependencyDeclarationNames"))
    refute(first.key?("dependencyDeclarations"))
    refute_includes(JSON.generate(first), "Example::Client")
    assert(first.fetch("namespaces").all? { |row| row.length == 15 && row.all?(Integer) })
    assert_equal(4, first.fetch("namespaces").find { |row| row[2].zero? }.last)
    assert(first.fetch("dependencyStars").all? { |row| row.length == 8 && row.all?(Integer) })
  end

  def test_keeps_snapshot_v4_compatibility_without_bounded_aggregate_fields
    snapshot = {
      "schema" => "rubylens.snapshot.v4",
      "project_name" => "Legacy Demo",
      "components" => [],
      "namespace_names" => [],
      "namespaces" => [],
      "category_stats" => { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] },
      "packages" => [{
        "name" => "legacy-gem", "role" => 1, "location" => 1, "ruby_counts" => [0, 0, 2, 0],
        "declarations" => [[2, 1, 1, 0, 0, 3, 4], [2, 2, 1, 0, 0, 5, 6]],
      }],
      "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
    }

    model = RubyLens::ArtModelBuilder.new(seed: 12).build(snapshot)

    assert_equal("rubylens.art.v7", model.fetch("schema"))
    assert_equal(2, model.dig("totals", "dependencyStars"))
    assert_equal(2, model.dig("totals", "renderedDependencyStars"))
    assert_equal({ "ancestorDepth" => 2, "definitionSites" => 1, "reopenings" => 0, "descendants" => 0,
      "references" => 5, "members" => 6 }, model.fetch("domains"))
  end

  def test_preserves_package_ruby_construct_counts
    snapshot = {
      "project_name" => "Aggregate Demo",
      "components" => [],
      "namespace_names" => [],
      "namespaces" => [],
      "category_stats" => { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] },
      "packages" => [
        {
          "name" => "example-gem",
          "role" => 0,
          "location" => 1,
          "ruby_counts" => [4, 5, 6, 7],
          "declarations" => [
            [0, 2, 3, 1, 4, 5, 6],
            [1, 1, 7, 2, 3, 4, 2],
          ],
        },
      ],
      "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
    }

    model = RubyLens::ArtModelBuilder.new(seed: 12).build(snapshot)

    assert_equal([0, 1, 2, 4, 5, 6, 7], model.fetch("packages").first.drop(1))
  end

  def test_caps_dependency_star_sampling
    declarations = 18_020.times.map { [2, 0, 1, 0, 0, 0, 0] }
    snapshot = {
      "project_name" => "Large Demo",
      "components" => [],
      "namespace_names" => [],
      "namespaces" => [],
      "category_stats" => { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] },
      "packages" => [{ "name" => "large-gem", "role" => 1, "location" => 1, "ruby_counts" => [1, 1, 18_020, 100], "declarations" => declarations }],
      "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
    }

    model = RubyLens::ArtModelBuilder.new(seed: 12).build(snapshot)

    assert_equal(18_020, model.dig("totals", "dependencyStars"))
    assert_equal(18_000, model.dig("totals", "renderedDependencyStars"))
    assert_equal(8, model.fetch("packages").first.length)
    assert_equal([1, 1, 18_020, 1, 1, 18_020, 100], model.fetch("packages").first.drop(1))
    refute(model.key?("dependencyDeclarationNames"))
  end

  def test_uses_exact_dependency_totals_and_domains_with_bounded_snapshot_rows
    snapshot = {
      "schema" => "rubylens.snapshot.v5",
      "project_name" => "Million Demo",
      "components" => [],
      "namespace_names" => [],
      "namespaces" => [],
      "category_stats" => { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] },
      "dependency_signal_maxima" => [99, 98, 97, 96, 95, 94],
      "packages" => [{
        "name" => "large-gem",
        "role" => 1,
        "location" => 1,
        "declaration_count" => 1_000_000,
        "ruby_counts" => [1, 2, 3, 4],
        "declarations" => [[0, 1, 1, 0, 0, 0, 0], [1, 2, 1, 0, 0, 0, 0]],
      }],
      "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
    }

    model = RubyLens::ArtModelBuilder.new(seed: 12).build(snapshot)

    assert_equal(1_000_000, model.dig("totals", "dependencyStars"))
    assert_equal(2, model.dig("totals", "renderedDependencyStars"))
    assert_equal([1, 1, 1_000_000, 1, 2, 3, 4], model.fetch("packages").first.drop(1))
    assert_equal(
      { "ancestorDepth" => 99, "definitionSites" => 98, "reopenings" => 97, "descendants" => 96,
        "references" => 95, "members" => 94 },
      model.fetch("domains")
    )
  end
end
