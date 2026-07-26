# frozen_string_literal: true

require "base64"
require_relative "test_helper"

class StitchGeneratorTest < Minitest::Test
  def test_stitches_artifacts_in_argument_order_with_their_own_results
    Dir.mktmpdir("rubylens-stitch-") do |directory|
      second = write_artifact(directory, "second", warnings: ["second warning"])
      first = write_artifact(directory, "first", warnings: [])
      output = File.join(directory, "universe.html")

      result = RubyLens::StitchGenerator.new(artifacts: [second, first], output: output).call
      galaxies = embedded_collection(output).fetch("galaxies")

      assert_equal(File.expand_path(output), result.output_path)
      assert_equal(%w[Second First], galaxies.map { |galaxy| galaxy.fetch("projectName") })
      assert_equal(%w[Second First], result.projects.map(&:name))
      assert_equal(["second warning"], result.projects.first.warnings)
      assert_equal({ "namespaces" => 2, "packages" => 1, "dependencyStars" => 3 }, result.projects.last.counts)
      assert_equal(0o600, File.stat(output).mode & 0o777)
    end
  end

  def test_requires_at_least_two_artifacts
    error = assert_raises(RubyLens::Error) do
      RubyLens::StitchGenerator.new(artifacts: ["one.json"]).call
    end

    assert_equal("stitch requires at least two Explorer artifacts", error.message)
  end

  def test_default_output_refuses_an_unrelated_existing_file
    Dir.mktmpdir("rubylens-stitch-default-") do |directory|
      first = write_artifact(directory, "first", warnings: [])
      second = write_artifact(directory, "second", warnings: [])
      output = File.join(directory, RubyLens::CollectionGenerator::DEFAULT_COLLECTION_NAME)
      File.binwrite(output, "unrelated private file")

      error = Dir.chdir(directory) do
        assert_raises(RubyLens::Error) do
          RubyLens::StitchGenerator.new(artifacts: [first, second]).call
        end
      end

      assert_equal("default collection path already exists and is not a RubyLens collection", error.message)
      assert_equal("unrelated private file", File.binread(output))
    end
  end

  private

  def write_artifact(directory, name, warnings:)
    path = File.join(directory, "#{name}.rubylens.json")
    galaxy = {
      "schema" => "rubylens.art.v13",
      "projectName" => name.capitalize,
      "totals" => { "namespaces" => 2, "packages" => 1, "dependencyStars" => 3 },
    }
    RubyLens::ExplorerArtifact.new(galaxy:, warnings:).write(output: path)
  end

  def embedded_collection(path)
    html = File.binread(path)
    encoded = html.match(/const sceneModel = decodeBase64Json\("([A-Za-z0-9+\/=]+)"\)/).captures.first
    JSON.parse(Base64.strict_decode64(encoded))
  end
end
