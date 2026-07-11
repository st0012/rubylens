# frozen_string_literal: true

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
    end
  end

  def test_gif_entry_point_is_removed
    refute_respond_to(RubyLens, :generate_gif)
  end
end
