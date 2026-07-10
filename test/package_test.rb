# frozen_string_literal: true

require_relative "test_helper"

class PackageTest < Minitest::Test
  def test_gem_file_list_contains_product_runtime_but_not_research_or_prototype_data
    specification = Gem::Specification.load(File.expand_path("../rubylens.gemspec", __dir__))

    assert_includes(specification.files, "exe/rubylens")
    assert_includes(specification.files, "assets/report.html")
    assert_includes(specification.files, "lib/rubylens/index/rubydex_adapter.rb")
    refute(specification.files.any? { |path| path.start_with?("prototype/") })
    refute(specification.files.any? { |path| path.start_with?("generated/") })
    refute_includes(specification.files, "lib/rubylens/extractor.rb")
  end
end
