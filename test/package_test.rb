# frozen_string_literal: true

require_relative "test_helper"

class PackageTest < Minitest::Test
  def test_gem_file_list_contains_product_runtime_but_not_research_or_prototype_data
    specification = Gem::Specification.load(File.expand_path("../rubylens.gemspec", __dir__))

    assert_includes(specification.files, "exe/rubylens")
    assert_includes(specification.files, "assets/runtime/report.js")
    assert_includes(specification.files, "assets/runtime/point_renderer.js")
    assert_includes(specification.files, "assets/shells/report.html")
    assert_includes(specification.files, "assets/styles/report.css")
    assert_includes(specification.files, "docs/MONOREPO_BOUNDARIES.md")
    assert_includes(specification.files, "docs/REFERENCE_ROUTES_FUTURE.md")
    assert_includes(specification.files, "lib/rubylens/gif_generator.rb")
    assert_includes(specification.files, "lib/rubylens/gif_writer.rb")
    assert_includes(specification.files, "lib/rubylens/report_asset_assembler.rb")
    assert_includes(specification.files, "lib/rubylens/index/rubydex_adapter.rb")
    refute(specification.files.any? { |path| path.start_with?("docs/assets/") })
    refute(specification.files.any? { |path| path.start_with?("prototype/") })
    refute(specification.files.any? { |path| path.start_with?("generated/") })
    refute_includes(specification.files, "lib/rubylens/extractor.rb")
    refute_includes(specification.files, "assets/report.html")
  end

  def test_gem_pins_the_capture_browser_dependency
    specification = Gem::Specification.load(File.expand_path("../rubylens.gemspec", __dir__))
    ferrum = specification.runtime_dependencies.find { |dependency| dependency.name == "ferrum" }

    refute_nil(ferrum)
    assert_equal(Gem::Requirement.new("= 0.17.2"), ferrum.requirement)
  end

  def test_gem_supports_the_rubydex_ruby_range
    specification = Gem::Specification.load(File.expand_path("../rubylens.gemspec", __dir__))

    assert(specification.required_ruby_version.satisfied_by?(Gem::Version.new("3.2.0")))
    assert(specification.required_ruby_version.satisfied_by?(Gem::Version.new("4.0.5")))
    refute(specification.required_ruby_version.satisfied_by?(Gem::Version.new("3.1.9")))
    refute(specification.required_ruby_version.satisfied_by?(Gem::Version.new("4.1.0")))
  end
end
