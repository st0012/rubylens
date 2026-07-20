# frozen_string_literal: true

require_relative "test_helper"

class ArtModelBuilderTest < Minitest::Test
  def test_builds_a_deterministic_local_art_contract_with_hover_identity
    private_git_source = "/Users/private/checkout https://secret@example.invalid/repository.git 0123456789abcdef"
    snapshot = {
      "project_name" => "Demo",
      "namespace_names" => ["Demo::Core", "Demo::TestCase"],
      "namespaces" => [
        [0, 0, 3, 1, 0, 2, 4, 5, 1, 0, 3, 2, 4],
        [1, 1, 1, 2, 1, 0, 3, 2, 0, 1, 1, 0, 0],
      ],
      "category_stats" => { "core" => [1, 1, 4, 2], "tests" => [0, 1, 1, 0] },
      "dependency_signal_maxima" => [1, 0, 1, 3, 4, 0],
      "packages" => [
        {
          "name" => "example-gem",
          "role" => 0,
          "location" => 1,
          "declaration_count" => 1,
          "ruby_counts" => [2, 1, 4, 3],
          "declarations" => [[0, 2, 1, 0, 1, 3, 4]],
        },
      ],
      "dependency_warnings" => [
        {
          "name" => "git-widget",
          "reason" => "Bundler checkout is unavailable",
          "source" => private_git_source,
          "path" => "/private/dependency/path",
          "uri" => "https://credentials@example.invalid/private.git",
          "revision" => "private-revision",
          "exception" => "raw dependency exception",
          "comment" => "private source comment",
        },
        { "name" => "unsafe-component", "reason" => "Raw exception: /private/source/path" },
        { "name" => "/private/dependency/name", "reason" => "Bundler checkout is unavailable" },
      ],
      "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
    }
    builder = RubyLens::ArtModelBuilder.new(seed: 12)

    first = builder.build(snapshot)
    second = builder.build(snapshot)

    assert_equal(first, second)
    assert_equal("rubylens.art.v11", first.fetch("schema"))
    assert_equal("Demo", first.fetch("projectName"))
    assert_equal(10, first.fetch("morphology").length)
    assert_equal(4, first.fetch("morphology").first)
    assert(first.fetch("morphology").all?(Integer))
    assert_equal(2, first.dig("totals", "namespaces"))
    assert_equal(1, first.dig("totals", "dependencyStars"))
    assert_equal({ "core" => [1, 1, 4, 2], "tests" => [0, 1, 1, 0] }, first.fetch("categoryStats"))
    assert_equal(["Demo::Core", "Demo::TestCase"].sort, first.fetch("namespaceNames").sort)
    assert_equal(["example-gem"], first.fetch("packageNames"))
    assert_equal(1, first.fetch("packageMorphologies").length)
    assert_equal(10, first.fetch("packageMorphologies").first.length)
    assert(first.fetch("packageMorphologies").first.all?(Integer))
    assert_equal(first.fetch("packages").first[0], first.fetch("packageMorphologies").first[9])
    assert_equal(
      [{ "name" => "git-widget", "reason" => "Bundler checkout is unavailable" }],
      first.fetch("dependencyWarnings"),
    )
    assert_equal([0, 1, 1, 2, 1, 4, 3, -1], first.fetch("packages").first.drop(1))
    assert_empty(first.fetch("dependencySystems"))
    assert_equal(
      %w[categoryStats dependencyStars dependencySystems dependencyWarnings domains
         morphology namespaceNames namespaces packageMorphologies packageNames packages projectName schema totals warningCounts],
      first.keys.sort,
    )
    refute_includes(JSON.generate(first), "Example::Client")
    refute_includes(JSON.generate(first), private_git_source)
    %w[private/dependency credentials@example.invalid private-revision raw\ dependency private\ source].each do |private_value|
      refute_includes(JSON.generate(first), private_value.tr("\\", ""))
    end
    assert(first.fetch("namespaces").all? { |row| row.length == 14 && row.all?(Integer) })
    assert_equal(4, first.fetch("namespaces").find { |row| row[1].zero? }.last)
    assert(first.fetch("dependencyStars").all? { |row| row.length == 8 && row.all?(Integer) })
  end

  def test_preserves_package_ruby_construct_counts
    snapshot = {
      "project_name" => "Aggregate Demo",
      "namespace_names" => [],
      "namespaces" => [],
      "category_stats" => { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] },
      "dependency_signal_maxima" => [7, 2, 4, 5, 6, 0],
      "packages" => [
        {
          "name" => "example-gem",
          "role" => 0,
          "location" => 1,
          "declaration_count" => 2,
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

    assert_equal([0, 1, 2, 4, 5, 6, 7, -1], model.fetch("packages").first.drop(1))
  end

  def test_package_morphology_does_not_inherit_the_project_morphology
    snapshot = {
      "project_name" => "Independent Demo",
      "namespace_names" => Array.new(100) { |index| "Root#{index}::Node" },
      "namespaces" => Array.new(100) { [0, 0, *Array.new(11, 0)] },
      "category_stats" => { "core" => [100, 0, 0, 0], "tests" => [0, 0, 0, 0] },
      "dependency_signal_maxima" => [1, 0, 0, 0, 0, 0],
      "packages" => [{
        "name" => "independent-gem", "role" => 1, "location" => 1,
        "declaration_count" => 100, "ruby_counts" => [0, 0, 20, 20], "declarations" => [],
      }],
      "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
    }
    project_spiral = Marshal.load(Marshal.dump(snapshot))
    project_spiral["namespace_names"] = Array.new(100) { |index| "Root::Node#{index}" }
    project_spiral["namespaces"].each { |row| row[0] = 1 }

    elliptical = RubyLens::ArtModelBuilder.new(seed: 12).build(snapshot)
    spiral = RubyLens::ArtModelBuilder.new(seed: 12).build(project_spiral)

    refute_equal(elliptical.fetch("morphology").first, spiral.fetch("morphology").first)
    assert_equal(elliptical.fetch("packageMorphologies"), spiral.fetch("packageMorphologies"))
  end

  def test_renders_every_dependency_declaration_from_a_complete_snapshot
    declarations = 18_020.times.map { [2, 0, 1, 0, 0, 0, 0] }
    snapshot = {
      "project_name" => "Large Demo",
      "namespace_names" => [],
      "namespaces" => [],
      "category_stats" => { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] },
      "dependency_signal_maxima" => [1, 0, 0, 0, 0, 0],
      "packages" => [{ "name" => "large-gem", "role" => 1, "location" => 1, "declaration_count" => 18_020, "ruby_counts" => [1, 1, 18_020, 100], "declarations" => declarations }],
      "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
    }

    model = RubyLens::ArtModelBuilder.new(seed: 12).build(snapshot)

    assert_equal(18_020, model.dig("totals", "dependencyStars"))
    assert_equal(9, model.fetch("packages").first.length)
    assert_equal(10, model.fetch("packageMorphologies").first.length)
    assert_equal([1, 1, 18_020, 1, 1, 18_020, 100, -1], model.fetch("packages").first.drop(1))
  end

  def test_dependency_rows_are_deterministic_across_snapshot_traversal_order
    snapshot = {
      "project_name" => "Stable Demo",
      "namespace_names" => [],
      "namespaces" => [],
      "category_stats" => { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] },
      "dependency_signal_maxima" => [1, 0, 0, 8, 4, 0],
      "packages" => [{
        "name" => "stable-gem",
        "role" => 1,
        "location" => 1,
        "declaration_count" => 3,
        "ruby_counts" => [1, 1, 2, 0],
        "declarations" => [[1, 5, 1, 0, 0, 8, 3], [0, 1, 1, 0, 0, 2, 4], [0, 1, 1, 0, 0, 2, 4]],
      }],
      "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
    }
    snapshot.fetch("packages").first.fetch("declarations").each(&:freeze)
    snapshot.fetch("packages").first.fetch("declarations").freeze
    original = Marshal.load(Marshal.dump(snapshot))
    reversed = Marshal.load(Marshal.dump(snapshot))
    reversed.fetch("packages").first.fetch("declarations").reverse!

    assert_equal(
      RubyLens::ArtModelBuilder.new(seed: 12).build(snapshot),
      RubyLens::ArtModelBuilder.new(seed: 12).build(reversed),
    )
    assert_equal(original, snapshot)
  end

  def test_uses_exact_dependency_totals_and_domains_with_bounded_snapshot_rows
    snapshot = {
      "schema" => "rubylens.snapshot.v7",
      "project_name" => "Million Demo",
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
    assert_equal([1, 1, 1_000_000, 1, 2, 3, 4, -1], model.fetch("packages").first.drop(1))
    assert_equal(
      { "ancestorDepth" => 99, "definitionSites" => 98, "reopenings" => 97, "descendants" => 96,
        "references" => 95, "members" => 94 },
      model.fetch("domains")
    )
  end


  def test_builds_numeric_dependency_systems_without_changing_package_totals_or_roles
    snapshot = {
      "project_name" => "System Demo",
      "namespace_names" => [],
      "namespaces" => [],
      "category_stats" => { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] },
      "dependency_signal_maxima" => [1, 0, 0, 0, 0, 0],
      "packages" => [
        { "name" => "system-meta", "role" => 0, "location" => 1, "declaration_count" => 0,
          "ruby_counts" => [0, 0, 0, 0], "declarations" => [] },
        { "name" => "system-implementation", "role" => 1, "location" => 1, "declaration_count" => 2,
          "ruby_counts" => [1, 0, 1, 0], "declarations" => [[0, 1, 1, 0, 0, 0, 0], [2, 0, 1, 0, 0, 0, 0]] },
        { "name" => "ordinary-gem", "role" => 1, "location" => 1, "declaration_count" => 1,
          "ruby_counts" => [0, 1, 0, 0], "declarations" => [[1, 0, 1, 0, 0, 0, 0]] },
      ],
      "dependency_systems" => [
        { "id" => 0, "package_indexes" => [0, 1], "label_package_index" => 0 },
      ],
      "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
    }

    first = RubyLens::ArtModelBuilder.new(seed: 12).build(snapshot)
    second = RubyLens::ArtModelBuilder.new(seed: 12).build(snapshot)
    names = first.fetch("packageNames")
    rows = names.zip(first.fetch("packages")).to_h
    system = first.fetch("dependencySystems").fetch(0)

    assert_equal(first, second)
    assert_equal(3, first.dig("totals", "packages"))
    assert_equal(3, first.dig("totals", "dependencyStars"))
    assert_equal(0, rows.fetch("system-meta")[1])
    assert_equal(1, rows.fetch("system-implementation")[1])
    assert_equal(0, rows.fetch("system-meta")[3])
    assert_equal(2, rows.fetch("system-implementation")[3])
    assert_equal(rows.fetch("system-meta")[8], rows.fetch("system-implementation")[8])
    assert_equal(-1, rows.fetch("ordinary-gem")[8])
    assert_equal(names.index("system-meta"), system[1])
    assert(system.all?(Integer))
  end
end
