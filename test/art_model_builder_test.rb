# frozen_string_literal: true

require_relative "test_helper"

class ArtModelBuilderTest < Minitest::Test
  def test_builds_configured_art_v8_with_explicit_budget_and_contiguous_ranges
    snapshot = configured_snapshot
    builder = RubyLens::ArtModelBuilder.new(seed: 12, namespace_budget: 3)
    model = builder.build(snapshot)
    reordered = snapshot.merge(
      "namespace_names" => snapshot.fetch("namespace_names").reverse,
      "namespaces" => snapshot.fetch("namespaces").reverse,
    )

    assert_equal(model, builder.build(reordered))
    assert_equal("rubylens.art.v8", model.fetch("schema"))
    assert_equal(4, model.dig("totals", "namespaces"))
    assert_equal(3, model.dig("totals", "renderedNamespaces"))
    assert_equal(2, model.dig("totals", "groups"))
    assert_equal([[0, 2], [2, 1]], model.fetch("groupRanges"))
    assert_equal([[2, 2], [1, 1]], model.fetch("groupLods"))
    assert_equal(["System Alpha", "System Beta"], model.fetch("groupNames"))
    assert(model.fetch("groups").all? { |row| row.length == 13 && row.all?(Integer) })
    assert(model.fetch("groupAnchors").all? { |row| row.length == 3 && row.all?(Integer) })
    assert_equal([4_278, 4_050], model.fetch("groupRadii"))
    assert_equal("association", model.fetch("explorerLayout"))
    assert_nil(model.fetch("explorerAnchors"))
    refute(model.key?("componentCounts"))
    model.fetch("groupRanges").each_with_index do |(first, length), group_index|
      assert(model.fetch("namespaces").slice(first, length).all? { |row| row.fetch(1) == group_index })
    end
    alpha_first, alpha_length = model.fetch("groupRanges").first
    assert_equal([0, 1], model.fetch("namespaces").slice(alpha_first, alpha_length).map { |row| row[3] }.sort)
    private_name_rank = Digest::SHA256.digest("rubylens.namespace\0#{12}\0Alpha::One").unpack1("N")
    private_group_seed = snapshot.fetch("groups").first.fetch("anchor_seed")
    refute_includes(model.fetch("namespaces").map(&:first), private_name_rank)
    refute_includes(model.fetch("groups").flatten, private_group_seed)
    serialized = JSON.generate(model)
    refute_includes(serialized, "private-alpha")
    refute_includes(serialized, "apps/alpha/**")
  end

  def test_uses_exact_namespace_signal_domains_at_every_explicit_budget
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

    beta_length = model.fetch("groupRanges")[1][1]
    expected_mid = [(Math.sqrt(beta_length) * 3).ceil, beta_length].min
    assert_equal(expected_mid, model.fetch("groupLods")[1][0])
  end

  def test_empty_group_keeps_its_ordinal_without_affecting_visible_system_geometry
    snapshot = configured_snapshot
    snapshot.fetch("groups") << {
      "id" => "empty", "name" => "Empty", "anchor_seed" => 999,
      "namespace_counts" => [0, 0, 0],
      "ruby_counts" => { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] },
      "cross_group_namespaces" => 0,
    }
    snapshot.fetch("components") << 0

    model = RubyLens::ArtModelBuilder.new(seed: 12, namespace_budget: 4).build(snapshot)

    assert_equal([4, 0], model.fetch("groupRanges").last)
    assert_equal([0, 0], model.fetch("groupLods").last)
    assert_equal([0, 0, 0], model.fetch("groupAnchors").last)
    assert_equal(0, model.fetch("groupRadii").last)
    assert_equal(3, model.dig("totals", "groups"))
  end

  def test_rejects_configured_dependency_rows_above_the_bounded_snapshot_contract
    snapshot = configured_snapshot
    snapshot["packages"] = [{
      "name" => "synthetic-package", "role" => 1, "location" => 1,
      "declaration_count" => 50_000, "ruby_counts" => [0, 0, 50_000, 0],
      "declarations" => Array.new(18_001) { [2, 0, 1, 0, 0, 0, 0] },
    }]

    error = assert_raises(RubyLens::Error) do
      RubyLens::ArtModelBuilder.new(seed: 12, namespace_budget: 3).build(snapshot)
    end

    assert_equal("configured dependency rows exceed the bounded snapshot contract", error.message)
  end

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
    assert_equal(
      "836e963fd7d1b593276605a78a807d0950837a937ff68670ab77e7629f04a1c6",
      Digest::SHA256.hexdigest(JSON.generate(first)),
    )
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

  private

  def configured_snapshot
    {
      "schema" => "rubylens.snapshot.v6",
      "explorer_layout" => "association",
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
