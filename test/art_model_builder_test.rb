# frozen_string_literal: true

require_relative "test_helper"

class ArtModelBuilderTest < Minitest::Test
  def test_builds_a_deterministic_local_art_contract_with_hover_identity
    snapshot = {
      "project_name" => "Demo",
      "components" => [2],
      "namespace_names" => ["Demo::Core", "Demo::TestCase"],
      "namespaces" => [
        [0, 0, 0, 3, 1, 0, 2, 4, 5],
        [0, 1, 1, 1, 2, 1, 0, 3, 2],
      ],
      "packages" => [
        {
          "name" => "example-gem",
          "role" => 0,
          "location" => 1,
          "declarations" => [{ "name" => "Example::Client", "signals" => [0, 2, 1, 0, 1, 3, 4] }],
        },
      ],
      "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
    }
    builder = RubyLens::ArtModelBuilder.new(seed: 12)

    first = builder.build(snapshot)
    second = builder.build(snapshot)

    assert_equal(first, second)
    assert_equal("rubylens.art.v2", first.fetch("schema"))
    assert_equal("Demo", first.fetch("projectName"))
    assert_equal(2, first.dig("totals", "namespaces"))
    assert_equal(1, first.dig("totals", "dependencyDeclarations"))
    assert_equal(1, first.dig("totals", "renderedDependencyDeclarations"))
    assert_equal([1, 1, 0], first.dig("totals", "scopes"))
    assert_equal(["Demo::Core", "Demo::TestCase"].sort, first.fetch("namespaceNames").sort)
    assert_equal(["example-gem"], first.fetch("packageNames"))
    assert_equal(["Example::Client"], first.fetch("dependencyDeclarationNames"))
    assert(first.fetch("namespaces").all? { |row| row.length == 10 && row.all?(Integer) })
    assert(first.fetch("dependencyDeclarations").all? { |row| row.length == 9 && row.all?(Integer) })
  end

  def test_samples_dependency_identity_before_serialization
    declarations = 18_020.times.map do |index|
      { "name" => "Example::Member#{index}", "signals" => [2, 0, 1, 0, 0, 0, 0] }
    end
    snapshot = {
      "project_name" => "Large Demo",
      "components" => [],
      "namespace_names" => [],
      "namespaces" => [],
      "packages" => [{ "name" => "large-gem", "role" => 1, "location" => 1, "declarations" => declarations }],
      "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
    }

    model = RubyLens::ArtModelBuilder.new(seed: 12).build(snapshot)

    assert_equal(18_020, model.dig("totals", "dependencyDeclarations"))
    assert_equal(18_000, model.dig("totals", "renderedDependencyDeclarations"))
    assert_equal(18_000, model.fetch("dependencyDeclarationNames").length)
  end
end
