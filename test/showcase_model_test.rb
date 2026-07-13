# frozen_string_literal: true

require_relative "test_helper"

class ShowcaseModelTest < Minitest::Test
  def test_projects_only_numeric_unified_visual_structure_and_aggregate_statistics
    private_value = "/private/path/Secret::Namespace hidden-gem source comment"
    model = unified_model.merge(
      "regionNames" => [private_value],
      "namespaceNames" => [private_value],
      "packageNames" => [private_value],
      "warningCounts" => { "index" => 0 },
      "frameworkReference" => {
        "kind" => "rails", "version" => "8.1.1", "scope" => "installed_footprint", "members" => ["actionpack"],
        "availableMembers" => ["actionpack"], "coverage" => [1, 1], "status" => "ready",
        "comparable" => true, "rubyCounts" => [20, 10], "systemRadius" => 25_000, "packageIndex" => 0,
      },
      "futurePrivateField" => private_value,
    )

    showcase = RubyLens::ShowcaseModel.new.call(model)
    encoded = JSON.generate(showcase)

    assert_equal(
      %w[categoryStats dependencyStars domains namespaceNames namespaces packageNames packages projectName regionBounds regionCentroids regionLods regionNames regionRanges regions schema totals warningCounts workspaceDensity workspaceRadius] -
        %w[namespaceNames packageNames regionNames warningCounts],
      showcase.keys.sort,
    )
    assert_equal("rubylens.showcase.v3", showcase.fetch("schema"))
    assert_equal(16, showcase.fetch("namespaces").first.length)
    assert_equal(8, showcase.fetch("packages").first.length)
    assert_equal(8, showcase.fetch("dependencyStars").first.length)
    refute_includes(encoded, private_value)
    %w[namespaceNames packageNames regionNames warningCounts].each { |field| refute_includes(encoded, field) }
    %w[frameworkReference rails installed_footprint actionpack 8.1.1].each { |value| refute_includes(encoded, value) }
  end

  def test_rejects_private_values_inside_the_numeric_contract
    model = unified_model
    model.fetch("namespaces").first[4] = "Secret::Namespace"

    error = assert_raises(RubyLens::Error) { RubyLens::ShowcaseModel.new.call(model) }

    assert_equal("showcase model rows must contain only numbers", error.message)
  end

  def test_rejects_pre_unification_art_contracts
    error = assert_raises(RubyLens::Error) do
      RubyLens::ShowcaseModel.new.call(unified_model.merge("schema" => "rubylens.art.v8"))
    end

    assert_equal("showcase model requires the unified art.v9 contract", error.message)
  end

  private

  def unified_model
    {
      "schema" => "rubylens.art.v9",
      "projectName" => "Synthetic App",
      "totals" => {
        "namespaces" => 1, "renderedNamespaces" => 1, "regions" => 1, "packages" => 1,
        "dependencyStars" => 1, "renderedDependencyStars" => 1,
      },
      "domains" => RubyLens::ArtModelBuilder::SIGNAL_FIELDS.to_h { |field| [field, 3] },
      "categoryStats" => { "core" => [1, 2, 3, 4], "tests" => [5, 6, 7, 8] },
      "workspaceRadius" => 42_000,
      "workspaceDensity" => [1, 1, 0, 1, 0, 1],
      "regions" => [[0, 1, 0, 0, 0, 1, 0, 2, 3, 0, 0, 0, 0]],
      "regionRanges" => [[0, 1]],
      "regionLods" => [[1, 1]],
      "regionBounds" => [[0, 6_283_185, 0, 42_000]],
      "regionCentroids" => [[12_000, 0, -4_000]],
      "namespaceNames" => ["Private::Namespace"],
      "namespaces" => [[1, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 1]],
      "packageNames" => ["private-package"],
      "packages" => [[2, 0, 1, 9, 1, 2, 3, 4]],
      "dependencyStars" => [[3, 0, 1, 2, 3, 4, 5, 6]],
      "warningCounts" => { "index" => 0 },
    }
  end
end
