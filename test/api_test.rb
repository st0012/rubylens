# frozen_string_literal: true

require "base64"
require_relative "test_helper"

class APITest < Minitest::Test
  def test_report_entry_point_and_compatibility_alias_generate_reports
    Dir.mktmpdir("rubylens-api-") do |directory|
      report = RubyLens.generate_report(path: SnapshotHelpers::FIXTURE, output: File.join(directory, "report.html"))
      legacy = RubyLens.generate(path: SnapshotHelpers::FIXTURE, output: File.join(directory, "legacy.html"))

      assert(RubyLens::ReportWriter.new.rubylens_report?(report.output_path))
      assert(RubyLens::ReportWriter.new.rubylens_report?(legacy.output_path))
      assert_equal(report.counts, legacy.counts)
    end
  end

  def test_showcase_entry_point_generates_a_showcase
    Dir.mktmpdir("rubylens-api-") do |directory|
      result = RubyLens.generate_showcase(
        path: SnapshotHelpers::FIXTURE,
        output: File.join(directory, "showcase.html"),
      )

      assert(RubyLens::ShowcaseWriter.new.rubylens_showcase?(result.output_path))
      assert_operator(result.counts.fetch("namespaces"), :>, 0)
      model = embedded_model(result.output_path)
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

  def test_gif_entry_point_is_removed
    refute_respond_to(RubyLens, :generate_gif)
  end


  private

  def embedded_model(path)
    encoded = File.read(path).match(/JSON\.parse\(atob\("([^"]+)"\)\)/)[1]
    JSON.parse(Base64.strict_decode64(encoded))
  end
end
