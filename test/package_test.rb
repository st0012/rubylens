# frozen_string_literal: true

require_relative "test_helper"

class PackageTest < Minitest::Test
  def test_gem_file_list_contains_product_runtime_but_not_research_or_prototype_data
    specification = Gem::Specification.load(File.expand_path("../rubylens.gemspec", __dir__))

    assert_includes(specification.files, "exe/rubylens")
    assert_includes(specification.files, "assets/runtime/report.js")
    assert_includes(specification.files, "assets/shells/report.html")
    assert_includes(specification.files, "assets/shells/showcase.html")
    assert_includes(specification.files, "assets/styles/report.css")
    assert_includes(specification.files, "assets/styles/showcase.css")
    assert_includes(specification.files, "LICENSE.txt")
    assert_includes(specification.files, "lib/rubylens/report_asset_assembler.rb")
    assert_includes(specification.files, "lib/rubylens/showcase_generator.rb")
    assert_includes(specification.files, "lib/rubylens/showcase_model.rb")
    assert_includes(specification.files, "lib/rubylens/showcase_writer.rb")
    assert_includes(specification.files, "lib/rubylens/index/rubydex_adapter.rb")
    refute(specification.files.any? { |path| path.start_with?("docs/assets/") })
    refute(specification.files.any? { |path| path.start_with?("prototype/") })
    refute(specification.files.any? { |path| path.start_with?("generated/") })
    refute(specification.files.any? { |path| path.start_with?("docs/") })
    refute_includes(specification.files, "lib/rubylens/extractor.rb")
    refute_includes(specification.files, "assets/report.html")
  end

  def test_gem_has_no_browser_or_gif_runtime_dependencies
    specification = Gem::Specification.load(File.expand_path("../rubylens.gemspec", __dir__))

    refute(specification.runtime_dependencies.any? { |dependency| dependency.name == "ferrum" })
    refute(specification.files.any? { |path| path.match?(/gif|ffmpeg|ferrum/i) })
  end

  def test_gem_supports_the_rubydex_ruby_range
    specification = Gem::Specification.load(File.expand_path("../rubylens.gemspec", __dir__))

    assert(specification.required_ruby_version.satisfied_by?(Gem::Version.new("3.2.0")))
    assert(specification.required_ruby_version.satisfied_by?(Gem::Version.new("4.0.5")))
    refute(specification.required_ruby_version.satisfied_by?(Gem::Version.new("3.1.9")))
    refute(specification.required_ruby_version.satisfied_by?(Gem::Version.new("4.1.0")))
  end

  def test_prerelease_metadata_protects_future_pushes
    specification = Gem::Specification.load(File.expand_path("../rubylens.gemspec", __dir__))

    assert(specification.version.prerelease?)
    assert_equal("MIT", specification.license)
    assert_equal("https://st0012.dev/rails-galaxy/", specification.homepage)
    assert_equal("https://rubygems.org", specification.metadata["allowed_push_host"])
    assert_equal("true", specification.metadata["rubygems_mfa_required"])
  end
end
