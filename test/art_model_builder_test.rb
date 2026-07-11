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
      "reference_routes" => [[0, 0, 1, 3], [1, 1, 0, 2]],
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
    assert_equal("rubylens.art.v6", first.fetch("schema"))
    assert_equal("Demo", first.fetch("projectName"))
    assert_equal(2, first.dig("totals", "namespaces"))
    assert_equal(1, first.dig("totals", "dependencyStars"))
    assert_equal(1, first.dig("totals", "renderedDependencyStars"))
    assert_equal({ "core" => [1, 1, 4, 2], "tests" => [0, 1, 1, 0] }, first.fetch("categoryStats"))
    assert_equal(["Demo::Core", "Demo::TestCase"].sort, first.fetch("namespaceNames").sort)
    assert_equal(["example-gem"], first.fetch("packageNames"))
    route_map = first.fetch("referenceRoutes").to_h do |source, target_kind, target, count|
      target_name = target_kind.zero? ? first.fetch("namespaceNames").fetch(target) : first.fetch("packageNames").fetch(target)
      [[first.fetch("namespaceNames").fetch(source), target_kind, target_name], count]
    end
    assert_equal(
      {
        ["Demo::Core", 0, "Demo::TestCase"] => 3,
        ["Demo::TestCase", 1, "example-gem"] => 2,
      },
      route_map,
    )
    assert_equal([0, 1, 1, 2, 1, 4, 3], first.fetch("packages").first.drop(1))
    refute(first.key?("dependencyDeclarationNames"))
    refute(first.key?("dependencyDeclarations"))
    refute_includes(JSON.generate(first), "Example::Client")
    assert(first.fetch("namespaces").all? { |row| row.length == 15 && row.all?(Integer) })
    assert_equal(4, first.fetch("namespaces").find { |row| row[2].zero? }.last)
    assert(first.fetch("dependencyStars").all? { |row| row.length == 8 && row.all?(Integer) })
    assert(first.fetch("referenceRoutes").all? { |row| row.length == 4 && row.all?(Integer) })
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
end
