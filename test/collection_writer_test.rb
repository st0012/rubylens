# frozen_string_literal: true

require "base64"
require_relative "test_helper"

class CollectionWriterTest < Minitest::Test
  def test_embeds_separate_project_models_in_one_explorer
    project_models = [model("First"), model("Second")]
    galaxy_payloads = project_models.map { |model| JSON.generate(model) }
    Dir.mktmpdir("rubylens-collection-writer-") do |directory|
      output = File.join(directory, "collection.html")
      RubyLens::CollectionWriter.new.write(galaxy_payloads, output: output)
      html = File.binread(output).force_encoding(Encoding::UTF_8)
      collection = embedded_collection(html)

      assert_equal("rubylens.collection.v2", collection.fetch("schema"))
      assert_equal(project_models, collection.fetch("galaxies"))
      assert_equal(1, html.scan('id="explorer-search"').length)
      assert_equal(1, html.scan('id="panel"').length)
      assert_equal(0, html.scan("<iframe").length)
      assert_includes(html, "RubyLens · Explorer")
      assert(RubyLens::ArtifactMarker.present?(output, RubyLens::CollectionWriter::MARKER))
      assert_equal(0o600, File.stat(output).mode & 0o777)
    end
  end

  def test_requires_at_least_two_project_payloads
    error = assert_raises(RubyLens::Error) do
      RubyLens::CollectionWriter.new.write([], output: File.join(Dir.tmpdir, "unused-collection.html"))
    end

    assert_equal("collection requires at least two galaxy payloads", error.message)
  end

  private

  def embedded_collection(html)
    encoded = html.match(/const sceneModel = decodeBase64Json\("([A-Za-z0-9+\/=]+)"\)/).captures.first
    JSON.parse(Base64.strict_decode64(encoded))
  end

  def model(name)
    {
      "schema" => "rubylens.art.v13",
      "projectName" => name,
      "totals" => { "namespaces" => 0, "packages" => 0, "dependencyStars" => 0 },
    }
  end
end
