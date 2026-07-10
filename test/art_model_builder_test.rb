# frozen_string_literal: true

require_relative "test_helper"

class ArtModelBuilderTest < Minitest::Test
  def test_builds_a_deterministic_anonymous_art_contract
    snapshot = {
      "components" => [2],
      "namespaces" => [
        [0, 0, 0, 3, 1, 0, 2, 4, 5],
        [0, 1, 1, 1, 2, 1, 0, 3, 2],
      ],
      "packages" => [
        { "role" => 0, "location" => 1, "declarations" => [[0, 2, 1, 0, 1, 3, 4]] },
      ],
      "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
    }
    builder = RubyLens::ArtModelBuilder.new(seed: 12)

    first = builder.build(snapshot)
    second = builder.build(snapshot)

    assert_equal(first, second)
    assert_equal("rubylens.art.v1", first.fetch("schema"))
    assert_equal(2, first.dig("totals", "namespaces"))
    assert_equal(1, first.dig("totals", "dependencyDeclarations"))
    assert_equal([1, 1, 0], first.dig("totals", "scopes"))
    assert(first.fetch("namespaces").all? { |row| row.length == 10 && row.all?(Integer) })
    assert(first.fetch("dependencyDeclarations").all? { |row| row.length == 9 && row.all?(Integer) })
  end
end
