# frozen_string_literal: true

require "base64"
require_relative "test_helper"

class APITest < Minitest::Test
  def test_report_entry_point_generates_reports
    Dir.mktmpdir("rubylens-api-") do |directory|
      report = RubyLens.generate_report(path: SnapshotHelpers::FIXTURE, output: File.join(directory, "report.html"))

      assert(RubyLens::ArtifactMarker.present?(report.output_path, RubyLens::ReportWriter::MARKER))
      report_model = embedded_model(report.output_path)
      assert_equal("rubylens.art.v11", report_model.fetch("schema"))
      assert_equal(10, report_model.fetch("morphology").length)
      assert_equal(report_model.fetch("packages").length, report_model.fetch("packageMorphologies").length)
    end
  end

  def test_showcase_entry_point_generates_a_showcase
    Dir.mktmpdir("rubylens-api-") do |directory|
      result = RubyLens.generate_showcase(
        path: SnapshotHelpers::FIXTURE,
        output: File.join(directory, "showcase.html"),
      )

      assert(RubyLens::ArtifactMarker.present?(result.output_path, RubyLens::ShowcaseWriter::MARKER))
      assert_operator(result.counts.fetch("namespaces"), :>, 0)
      model = embedded_model(result.output_path)
      assert_equal("rubylens.showcase.v5", model.fetch("schema"))
      assert_equal(10, model.fetch("morphology").length)
      assert_equal(model.fetch("packages").length, model.fetch("packageMorphologies").length)
      assert_equal(false, model.fetch("details"))
      refute(model.key?("totals"))
      refute(model.key?("categoryStats"))
      refute(model.key?("annotations"))
    end
  end

  def test_showcase_details_opt_in_serializes_safe_annotations_and_statistics
    Dir.mktmpdir("rubylens-api-") do |directory|
      result = RubyLens.generate_showcase(
        path: SnapshotHelpers::FIXTURE,
        output: File.join(directory, "showcase.html"),
        details: true,
      )
      model = embedded_model(result.output_path)

      assert_equal(true, model.fetch("details"))
      assert(model.key?("totals"))
      assert(model.key?("categoryStats"))
      assert_operator(model.fetch("annotations").length, :>, 0)
      assert_operator(model.fetch("annotations").length, :<=, RubyLens::ShowcaseModel::ANNOTATION_LIMIT)
    end
  end

  def test_public_api_is_exactly_the_report_showcase_and_clip_generators
    assert_equal(%i[generate_clip generate_report generate_showcase], RubyLens.singleton_methods(false).sort)
  end

  private

  def embedded_model(path)
    encoded = File.read(path).match(/JSON\.parse\(atob\("([^"]+)"\)\)/)[1]
    JSON.parse(Base64.strict_decode64(encoded))
  end
end
