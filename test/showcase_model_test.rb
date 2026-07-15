# frozen_string_literal: true

require_relative "test_helper"

class ShowcaseModelTest < Minitest::Test
  def test_minimal_projection_omits_statistics_and_private_names
    private_value = "/private/path/Secret::Namespace hidden-gem source comment"
    model = {
      "schema" => "rubylens.art.v9",
      "projectName" => "Synthetic App",
      "morphology" => { "family" => 3, "designation" => "SBb", "knobs" => [0, 240, 3, 105, 500, 400, 0, 0, 1234, private_value] },
      "totals" => { "namespaces" => 1, "packages" => 1, "dependencyStars" => 1, "renderedDependencyStars" => 1, "future" => private_value },
      "domains" => RubyLens::ArtModelBuilder::SIGNAL_FIELDS.to_h { |field| [field, 3] }.merge("future" => private_value),
      "categoryStats" => { "core" => [1, 2, 3, 4], "tests" => [5, 6, 7, 8], "future" => private_value },
      "namespaceNames" => [private_value],
      "namespaces" => [[1, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, private_value]],
      "packageNames" => [private_value],
      "packages" => [[2, 0, 1, 9, 1, 2, 3, 4, 0, private_value]],
      "dependencySystems" => [[4, 0, private_value]],
      "dependencyStars" => [[3, 0, 1, 2, 3, 4, 5, 6, private_value]],
      "warningCounts" => { "index" => 0 },
      "dependencyWarnings" => [{ "name" => "secret-git-gem", "reason" => private_value }],
      "futurePrivateField" => private_value,
    }

    showcase = RubyLens::ShowcaseModel.new.call(model)
    encoded = JSON.generate(showcase)

    assert_equal(
      %w[dependencyStars dependencySystems details domains morphology namespaces packages projectName schema],
      showcase.keys.sort,
    )
    assert_equal(false, showcase.fetch("details"))
    assert_equal("rubylens.showcase.v3", showcase.fetch("schema"))
    assert_equal([3, 0, 240, 3, 105, 500, 400, 0, 0, 1234], showcase.fetch("morphology"))
    assert_equal(15, showcase.fetch("namespaces").first.length)
    assert_equal(9, showcase.fetch("packages").first.length)
    assert_equal(2, showcase.fetch("dependencySystems").first.length)
    assert_equal(8, showcase.fetch("dependencyStars").first.length)
    refute_includes(encoded, private_value)
    refute_includes(encoded, "namespaceNames")
    refute_includes(encoded, "packageNames")
    refute_includes(encoded, "warningCounts")
    refute_includes(encoded, "dependencyWarnings")
    refute_includes(encoded, "secret-git-gem")
    refute_includes(encoded, "totals")
    refute_includes(encoded, "categoryStats")
    refute_includes(encoded, "annotations")
    refute_includes(encoded, "SBb")
  end

  def test_annotated_projection_is_safe_balanced_deterministic_and_capped
    model = annotated_model(90)
    first = RubyLens::ShowcaseModel.new.call(model, details: true)
    second = RubyLens::ShowcaseModel.new.call(model, details: true)
    annotations = first.fetch("annotations")

    assert_equal(first, second)
    assert_equal(true, first.fetch("details"))
    assert_equal(model.fetch("totals"), first.fetch("totals"))
    assert_equal(model.fetch("categoryStats"), first.fetch("categoryStats"))
    assert_equal(model.fetch("dependencySystems"), first.fetch("dependencySystems"))
    assert_equal(RubyLens::ShowcaseModel::ANNOTATION_LIMIT, annotations.length)
    assert_equal(%w[core dependencies tests core dependencies tests], annotations.first(6).map { |annotation| annotation.fetch("category") })
    assert_equal(%w[anchor category kind name], annotations.first.keys.sort)
    annotations.each do |annotation|
      assert_kind_of(Integer, annotation.fetch("anchor"))
      assert_operator(annotation.fetch("name").length, :<=, RubyLens::ShowcaseModel::MAX_ANNOTATION_NAME_LENGTH)
    end
    encoded = JSON.generate(first)
    refute_includes(encoded, "/private/")
    refute_includes(encoded, "https://")
    refute_includes(encoded, "RSpec example group #")
    refute_includes(encoded, "unsafe package")
  end

  def test_annotated_projection_omits_root_runtime_constants_without_removing_their_points
    model = minimal_model
    model["namespaceNames"] = ["Object", "Kernel", "BasicObject", "Synthetic::Object"]
    model["namespaces"] = model.fetch("namespaceNames").each_index.map do |index|
      [index, 0, 0, 0, index + 1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 0]
    end
    model.fetch("totals")["namespaces"] = model.fetch("namespaces").length

    showcase = RubyLens::ShowcaseModel.new.call(model, details: true)

    assert_equal(4, showcase.fetch("namespaces").length)
    assert_equal([0, 1, 2], showcase.fetch("pinnedNamespaceAnchors"))
    assert(showcase.fetch("pinnedNamespaceAnchors").all? { |anchor| anchor.is_a?(Integer) })
    assert_equal(["Synthetic::Object"], showcase.fetch("annotations").map { |annotation| annotation.fetch("name") })
  end

  def test_only_literal_true_enables_details
    showcase = RubyLens::ShowcaseModel.new.call(minimal_model, details: "true")

    assert_equal(false, showcase.fetch("details"))
    refute(showcase.key?("totals"))
    refute(showcase.key?("annotations"))
  end

  def test_rejects_private_values_inside_the_numeric_contract
    model = minimal_model
    model.fetch("namespaces").first[4] = "Secret::Namespace"

    error = assert_raises(RubyLens::Error) { RubyLens::ShowcaseModel.new.call(model) }

    assert_equal("showcase model rows must contain only numbers", error.message)
  end

  def test_rejects_private_values_inside_morphology
    model = minimal_model
    model.fetch("morphology").fetch("knobs")[4] = "secret"

    error = assert_raises(RubyLens::Error) { RubyLens::ShowcaseModel.new.call(model) }

    assert_equal("showcase model rows must contain only numbers", error.message)
  end

  private

  def minimal_model
    {
      "projectName" => "Synthetic App",
      "morphology" => { "family" => 2, "designation" => "Sb", "knobs" => [0, 240, 3, 105, 500, 0, 0, 0, 1234] },
      "totals" => { "namespaces" => 1, "packages" => 0, "dependencyStars" => 0, "renderedDependencyStars" => 0 },
      "domains" => RubyLens::ArtModelBuilder::SIGNAL_FIELDS.to_h { |field| [field, 0] },
      "categoryStats" => { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] },
      "namespaceNames" => ["Synthetic::Node"],
      "namespaces" => [[0] * 15],
      "packageNames" => [],
      "packages" => [],
      "dependencySystems" => [],
      "dependencyStars" => [],
    }
  end

  def annotated_model(count)
    core_names = Array.new(count) { |index| format("Synthetic::Core%03d", index) }
    test_names = Array.new(count) { |index| format("Synthetic::Test%03d", index) }
    package_names = Array.new(count) { |index| format("synthetic-gem-%03d", index) }
    namespace_names = core_names + test_names + ["/private/Secret", "https://example.test/Name", "RSpec example group #000001"]
    namespaces = Array.new(count) { |index| [index, 0, index.even? ? 0 : 1, 0, index + 1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 0] }
    namespaces.concat(Array.new(count) { |index| [10_000 + index, 0, index.even? ? 0 : 1, 1, index + 1, 2, 3, 4, 5, 6, 1, 0, 2, 0, 0] })
    namespaces.concat(Array.new(3) { |index| [20_000 + index, 0, 0, 0, 1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 0] })
    packages = Array.new(count) { |index| [30_000 + index, 0, 1, index + 1, 1, 2, 3, 4, -1] }
    package_names.concat(["unsafe package", "https://example.test/gem", "../secret"])
    packages.concat(Array.new(3) { |index| [40_000 + index, 0, 1, 1, 1, 2, 3, 4, -1] })
    {
      "projectName" => "Synthetic App",
      "morphology" => { "family" => 2, "designation" => "Sb", "knobs" => [0, 240, 3, 105, 500, 0, 0, 0, 1234] },
      "totals" => { "namespaces" => namespaces.length, "packages" => packages.length, "dependencyStars" => 0, "renderedDependencyStars" => 0 },
      "domains" => RubyLens::ArtModelBuilder::SIGNAL_FIELDS.to_h { |field| [field, 10] },
      "categoryStats" => { "core" => [count, count / 2, count * 2, count / 3], "tests" => [count, 0, count * 3, 0] },
      "namespaceNames" => namespace_names,
      "namespaces" => namespaces,
      "packageNames" => package_names,
      "packages" => packages,
      "dependencySystems" => [],
      "dependencyStars" => [],
    }
  end
end
