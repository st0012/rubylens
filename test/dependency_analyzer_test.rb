# frozen_string_literal: true

require_relative "test_helper"

class DependencyAnalyzerTest < Minitest::Test
  def test_platform_variants_share_one_name_version_package
    analyzer = RubyLens::DependencyAnalyzer.allocate
    records = %w[ruby arm64-darwin x86_64-linux].map do |platform|
      {
        "name" => "multi-platform",
        "locked_version" => "1.2.3",
        "locked_platform" => platform,
      }
    end

    grouped = analyzer.send(:grouped_ledger_records, records)

    assert_equal(1, grouped.length)
    assert_equal(3, grouped.fetch(["multi-platform", "1.2.3"]).length)
  end
end
