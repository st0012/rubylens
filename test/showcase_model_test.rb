# frozen_string_literal: true

require_relative "test_helper"

class ShowcaseModelTest < Minitest::Test
  def test_projects_only_numeric_visual_structure_and_aggregate_statistics
    private_value = "/private/path/Secret::Namespace hidden-gem source comment"
    model = {
      "schema" => "rubylens.art.v7",
      "projectName" => "Synthetic App",
      "totals" => { "namespaces" => 1, "packages" => 1, "dependencyStars" => 1, "renderedDependencyStars" => 1, "future" => private_value },
      "domains" => RubyLens::ArtModelBuilder::SIGNAL_FIELDS.to_h { |field| [field, 3] }.merge("future" => private_value),
      "categoryStats" => { "core" => [1, 2, 3, 4], "tests" => [5, 6, 7, 8], "future" => private_value },
      "namespaceNames" => [private_value],
      "referenceRoutes" => [[0, 0, 0, private_value]],
      "namespaces" => [[1, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, private_value]],
      "packageNames" => [private_value],
      "packages" => [[2, 0, 1, 9, 1, 2, 3, 4, private_value]],
      "dependencyStars" => [[3, 0, 1, 2, 3, 4, 5, 6, private_value]],
      "warningCounts" => { "index" => 0 },
      "futurePrivateField" => private_value,
    }

    showcase = RubyLens::ShowcaseModel.new.call(model)
    encoded = JSON.generate(showcase)

    assert_equal(
      %w[categoryStats dependencyStars domains namespaces packages projectName schema totals],
      showcase.keys.sort,
    )
    assert_equal("rubylens.showcase.v1", showcase.fetch("schema"))
    assert_equal(15, showcase.fetch("namespaces").first.length)
    assert_equal(8, showcase.fetch("packages").first.length)
    assert_equal(8, showcase.fetch("dependencyStars").first.length)
    refute_includes(encoded, private_value)
    refute_includes(encoded, "namespaceNames")
    refute_includes(encoded, "packageNames")
    refute_includes(encoded, "referenceRoutes")
    refute_includes(encoded, "warningCounts")
  end

  def test_rejects_private_values_inside_the_numeric_contract
    model = minimal_model
    model.fetch("namespaces").first[4] = "Secret::Namespace"

    error = assert_raises(RubyLens::Error) { RubyLens::ShowcaseModel.new.call(model) }

    assert_equal("showcase model rows must contain only numbers", error.message)
  end

  def test_projects_configured_groups_as_anonymous_numeric_structure
    private_value = "Acme Foundation apps/* /private/config.yml"
    model = minimal_model.merge(
      "schema" => "rubylens.art.v9",
      "totals" => minimal_model.fetch("totals").merge("renderedNamespaces" => 1, "groups" => 1),
      "groupNames" => [private_value],
      "groups" => [[0, 1, 0, 0, 0, 1, 0, 2, 3, 0, 0, 0, 0]],
      "groupRanges" => [[0, 1]],
      "groupLods" => [[1, 1]],
      "groupAnchors" => [[-12, 0, 12]],
      "groupRadii" => [4_000],
      "explorerLayout" => "atlas",
      "explorerAnchors" => [[0, 12, 0]],
      "namespaceNames" => ["Acme::Private"],
      "packageNames" => ["private-package"],
      "referenceRoutes" => [[0, 0, 0, 1]],
    )

    showcase = RubyLens::ShowcaseModel.new.call(model)
    encoded = JSON.generate(showcase)

    assert_equal("rubylens.showcase.v2", showcase.fetch("schema"))
    assert_equal(
      %w[categoryStats dependencyStars domains groupAnchors groupLods groupRadii groupRanges groups namespaces packages projectName schema totals],
      showcase.keys.sort,
    )
    assert_equal([[0, 1, 0, 0, 0, 1, 0, 2, 3, 0, 0, 0, 0]], showcase.fetch("groups"))
    refute_includes(encoded, private_value)
    refute_includes(encoded, "Acme::Private")
    refute_includes(encoded, "private-package")
    refute_includes(encoded, "groupNames")
    refute_includes(encoded, "namespaceNames")
    refute_includes(encoded, "packageNames")
    refute_includes(encoded, "referenceRoutes")
    refute_includes(encoded, "explorerLayout")
    refute_includes(encoded, "explorerAnchors")
  end

  private

  def minimal_model
    {
      "schema" => "rubylens.art.v7",
      "projectName" => "Synthetic App",
      "totals" => { "namespaces" => 1, "packages" => 0, "dependencyStars" => 0, "renderedDependencyStars" => 0 },
      "domains" => RubyLens::ArtModelBuilder::SIGNAL_FIELDS.to_h { |field| [field, 0] },
      "categoryStats" => { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] },
      "namespaces" => [[0] * 15],
      "packages" => [],
      "dependencyStars" => [],
    }
  end
end
