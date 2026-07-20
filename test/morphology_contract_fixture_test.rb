# frozen_string_literal: true

require "json"
require_relative "test_helper"

# The Ruby classifier and the runtime's decodeMorphology are two
# implementations of one row schema. This golden fixture pins what the
# classifier emits; test/js/morphology_contract.test.mjs asserts the runtime
# decodes every row losslessly. Regenerate with REGENERATE_FIXTURES=1.
class MorphologyContractFixtureTest < Minitest::Test
  FIXTURE_PATH = File.expand_path("js/fixtures/morphology_contract.json", __dir__)

  def test_fixture_matches_the_classifier_output
    generated = "#{JSON.pretty_generate(entries)}\n"
    if ENV["REGENERATE_FIXTURES"] == "1"
      File.write(FIXTURE_PATH, generated)
    end

    assert_path_exists(FIXTURE_PATH, "run REGENERATE_FIXTURES=1 bundle exec rake to create the fixture")
    assert_equal(
      generated,
      File.read(FIXTURE_PATH),
      "classifier output changed; regenerate with REGENERATE_FIXTURES=1 bundle exec rake",
    )
  end

  private

  def entries
    project_cases.map { |label, snapshot| entry(label, RubyLens::MorphologyClassifier.new(snapshot).call) } +
      package_cases.map do |label, package, phase_seed|
        entry(label, RubyLens::MorphologyClassifier.new(package:, phase_seed:).call)
      end
  end

  def entry(label, morphology)
    {
      "label" => label,
      "family" => morphology.fetch("family"),
      "designation" => morphology.fetch("designation"),
      "row" => [morphology.fetch("family"), *morphology.fetch("knobs")],
    }
  end

  def project_cases
    [
      ["irregular-tiny", snapshot(core: 29)],
      ["elliptical-plain", snapshot(core: 100)],
      ["lenticular-dependencies", snapshot(core: 100, dependencies: 400)],
      ["spiral-spread-roots", snapshot(core: 100, modules: 50, tests: 50, dependencies: 100, roots: 10)],
      ["barred-concentrated-root", snapshot(core: 100, modules: 50, tests: 50, dependencies: 100, roots: 1)],
    ]
  end

  def package_cases
    [
      ["package-elliptical", { "declaration_count" => 30, "ruby_counts" => [0, 0, 30, 0] }, 1234],
      ["package-lenticular", { "declaration_count" => 30, "ruby_counts" => [0, 1, 30, 0] }, 1234],
      ["package-spiral", { "declaration_count" => 100, "ruby_counts" => [0, 0, 20, 20] }, 4321],
      ["package-irregular-small", { "declaration_count" => 12, "ruby_counts" => [1, 0, 8, 1] }, 77],
      ["package-fallback", { "declaration_count" => 100, "ruby_counts" => [0, 0, 0, 0] }, 999],
    ]
  end

  def snapshot(core:, modules: 0, tests: 0, dependencies: 0, roots: nil)
    root_total = roots || core
    base, remainder = core.divmod(root_total)
    root_counts = Array.new(root_total) { |index| base + (index < remainder ? 1 : 0) }
    names = root_counts.each_with_index.flat_map do |count, root|
      Array.new(count) { |index| "Root#{root}::Node#{index}" }
    end.first(core)
    core_rows = Array.new(core) { |index| [index < modules ? 1 : 0, 0, *Array.new(11, 0)] }
    test_rows = Array.new(tests) { [0, 1, *Array.new(11, 0)] }
    {
      "namespaces" => core_rows + test_rows,
      "namespace_names" => names + Array.new(tests) { |index| "Spec::Case#{index}" },
      "packages" => [{ "declaration_count" => dependencies }],
      "project_name" => "Synthetic",
    }
  end
end
