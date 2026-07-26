# frozen_string_literal: true

require_relative "test_helper"

class ExplorerArtifactTest < Minitest::Test
  def test_round_trips_one_galaxy_and_its_warnings
    galaxy = model("Alpha")
    warnings = ["A dependency was unavailable."]

    Dir.mktmpdir("rubylens-explorer-artifact-") do |directory|
      output = File.join(directory, "alpha.rubylens.json")
      written = RubyLens::ExplorerArtifact.new(galaxy:, warnings:).write(output: output)
      payload = JSON.parse(File.binread(output))
      artifact = RubyLens::ExplorerArtifact.read(output)

      assert_equal(File.expand_path(output), written)
      assert_equal("rubylens.explorer.v1", payload.fetch("schema"))
      assert_equal(%w[schema galaxy warnings], payload.keys)
      assert_equal(galaxy, artifact.galaxy)
      assert_equal(warnings, artifact.warnings)
      assert_equal(0o600, File.stat(output).mode & 0o777)
      assert(RubyLens::ExplorerArtifact.owned?(output))
    end
  end

  def test_rejects_malformed_and_unsupported_payloads
    cases = {
      "[]" => "must contain a JSON object",
      JSON.generate("schema" => "rubylens.explorer.v2") => "unsupported explorer artifact schema",
      JSON.generate("schema" => "rubylens.explorer.v1", "galaxy" => {}) => "galaxy must use rubylens.art.v13",
      JSON.generate(
        "schema" => "rubylens.explorer.v1",
        "galaxy" => model("Alpha"),
        "warnings" => [7],
      ) => "warnings must be an array of strings",
      "{" => "invalid explorer artifact JSON",
    }

    Dir.mktmpdir("rubylens-invalid-explorer-artifact-") do |directory|
      cases.each_with_index do |(contents, expected), index|
        path = File.join(directory, "invalid-#{index}.json")
        File.binwrite(path, contents)

        error = assert_raises(RubyLens::Error) { RubyLens::ExplorerArtifact.read(path) }

        assert_includes(error.message, expected)
        refute(RubyLens::ExplorerArtifact.owned?(path)) unless contents.include?(RubyLens::ExplorerArtifact::SCHEMA)
      end
    end
  end

  private

  def model(name)
    {
      "schema" => "rubylens.art.v13",
      "projectName" => name,
      "totals" => { "namespaces" => 2, "packages" => 1, "dependencyStars" => 3 },
    }
  end
end
