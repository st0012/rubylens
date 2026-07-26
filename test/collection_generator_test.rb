# frozen_string_literal: true

require "base64"
require_relative "test_helper"

class CollectionGeneratorTest < Minitest::Test
  RSPEC_FIXTURE = SnapshotHelpers::ROOT.join("test/fixtures/rspec_repo")

  def test_generates_one_collection_from_separate_models_in_target_order
    Dir.mktmpdir("rubylens-collection-generator-") do |directory|
      output = File.join(directory, "collection.html")
      result = RubyLens::CollectionGenerator.new(
        paths: [SnapshotHelpers::FIXTURE, RSPEC_FIXTURE],
        output: output,
      ).call
      models = embedded_models(output)
      standalone_models = [SnapshotHelpers::FIXTURE, RSPEC_FIXTURE].each_with_index.map do |path, index|
        standalone = File.join(directory, "standalone-#{index}.html")
        RubyLens::Generator.new(path: path, output: standalone).call
        embedded_report_model(standalone)
      end

      assert_equal(output, result.output_path)
      assert_equal(["Tiny Repo", "Rspec Repo"], result.projects.map(&:name))
      assert_equal(["Tiny Repo", "Rspec Repo"], models.map { |model| model.fetch("projectName") })
      assert_equal([9, 9], models.map { |model| model.dig("totals", "namespaces") })
      assert(models.all? { |model| model.fetch("schema") == "rubylens.art.v13" })
      normalized_standalone = standalone_models.map do |model|
        model.merge("constantReferenceLinks" => model.fetch("constantReferenceLinks").sort)
      end
      normalized_collection = models.map do |model|
        model.merge("constantReferenceLinks" => model.fetch("constantReferenceLinks").sort)
      end
      assert_equal(normalized_standalone, normalized_collection)
    end
  end

  def test_requires_two_distinct_targets
    error = assert_raises(RubyLens::Error) do
      RubyLens::CollectionGenerator.new(paths: [SnapshotHelpers::FIXTURE]).call
    end
    assert_equal("collection requires at least two targets", error.message)

    error = assert_raises(RubyLens::Error) do
      RubyLens::CollectionGenerator.new(paths: [SnapshotHelpers::FIXTURE, SnapshotHelpers::FIXTURE]).call
    end
    assert_equal("collection targets must be distinct", error.message)
  end

  def test_default_output_belongs_to_first_target_and_is_locally_excluded
    Dir.mktmpdir("rubylens-collection-default-") do |directory|
      first = File.join(directory, "first")
      second = File.join(directory, "second")
      [first, second].each do |root|
        Dir.mkdir(root)
        system("git", "-C", root, "init", "--quiet", exception: true)
      end

      result = RubyLens::CollectionGenerator.new(paths: [first, second]).call

      assert_equal(File.join(File.realpath(first), "rubylens-collection.html"), result.output_path)
      assert(system("git", "-C", first, "check-ignore", "--quiet", result.output_path))
      assert(RubyLens::ArtifactMarker.present?(result.output_path, RubyLens::CollectionWriter::MARKER))
    end
  end

  private

  def embedded_models(path)
    html = File.binread(path)
    encoded = html.match(/const sceneModel = decodeBase64Json\("([A-Za-z0-9+\/=]+)"\)/).captures.first
    collection = JSON.parse(Base64.strict_decode64(encoded))
    collection.fetch("galaxies")
  end

  def embedded_report_model(path)
    payload = File.binread(path).match(/const sceneModel = decodeBase64Json\("([A-Za-z0-9+\/=]+)"\)/).captures.first
    JSON.parse(Base64.strict_decode64(payload))
  end
end
