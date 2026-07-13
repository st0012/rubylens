# frozen_string_literal: true

require_relative "../test_helper"

class RailsFrameworkReferenceTest < Minitest::Test
  Package = Data.define(:name, :version, :files)
  Manifest = Data.define(:rails_reference, :packages)

  def test_builds_one_bounded_reference_from_the_exact_aligned_framework_family
    reference = RubyLens::Model::RailsFrameworkReference.new(complete_manifest)

    reference.add_namespace(0)
    reference.add_namespace(0)
    reference.add_namespace(1)
    result = reference.build(index_complete: true, integrity_complete: true)

    assert_equal("rails", result.fetch("kind"))
    assert_equal("8.1.1", result.fetch("version"))
    assert_equal(RubyLens::Model::RailsFrameworkReference::FRAMEWORK_GEMS, result.fetch("members"))
    assert_equal([12, 12], result.fetch("coverage"))
    assert_equal("ready", result.fetch("status"))
    assert_equal(true, result.fetch("comparable"))
    assert_equal([2, 1], result.fetch("ruby_counts"))
    assert_equal(0, result.fetch("package_index"))
    refute(reference.family_package_index?(0), "the Rails meta-gem must not contribute to framework size")
    refute(reference.family_package_index?(13), "unrelated transitive gems must not enter the family")
  end

  def test_suppresses_comparison_when_a_member_is_missing_or_misaligned
    packages = complete_packages.reject { |package| package.name == "actionview" }
    packages << Package.new(name: "actionview", version: "8.1.0", files: ["lib/action_view.rb"])
    reference = RubyLens::Model::RailsFrameworkReference.new(manifest_with(packages:))
    reference.add_namespace(0)

    result = reference.build(index_complete: true, integrity_complete: true)

    assert_equal([11, 12], result.fetch("coverage"))
    assert_equal("partial_family", result.fetch("status"))
    assert_equal(false, result.fetch("comparable"))
    assert_empty(result.fetch("ruby_counts"))
    refute_includes(result.fetch("available_members"), "actionview")
  end

  def test_suppresses_comparison_when_global_index_coverage_is_incomplete
    reference = RubyLens::Model::RailsFrameworkReference.new(complete_manifest)
    reference.add_namespace(0)

    result = reference.build(index_complete: false, integrity_complete: true)

    assert_equal([12, 12], result.fetch("coverage"))
    assert_equal("coverage_incomplete", result.fetch("status"))
    assert_equal(false, result.fetch("comparable"))
    assert_empty(result.fetch("ruby_counts"))
  end

  def test_rejects_an_unrecognized_rails_family_shape
    locked = RubyLens::Index::Manifest::RailsReference.new(
      version: "8.1.1",
      direct_dependencies: RubyLens::Model::RailsFrameworkReference::FRAMEWORK_GEMS.drop(1),
    )
    reference = RubyLens::Model::RailsFrameworkReference.new(Manifest.new(rails_reference: locked, packages: complete_packages))

    result = reference.build(index_complete: true, integrity_complete: true)

    assert_equal("unsupported_family_shape", result.fetch("status"))
    assert_equal([12, 12], result.fetch("coverage"))
    assert_equal(false, result.fetch("comparable"))
  end

  def test_does_not_detect_name_substrings
    packages = [Package.new(name: "rubocop-rails", version: "2.0.0", files: ["lib/rubocop-rails.rb"])]
    reference = RubyLens::Model::RailsFrameworkReference.new(Manifest.new(rails_reference: nil, packages:))

    assert_equal(false, reference.detected?)
    assert_nil(reference.build(index_complete: true, integrity_complete: true))
  end

  private

  def complete_manifest
    manifest_with(packages: complete_packages)
  end

  def manifest_with(packages:)
    locked = RubyLens::Index::Manifest::RailsReference.new(
      version: "8.1.1",
      direct_dependencies: RubyLens::Model::RailsFrameworkReference::FRAMEWORK_GEMS,
    )
    Manifest.new(rails_reference: locked, packages:)
  end

  def complete_packages
    [
      Package.new(name: "rails", version: "8.1.1", files: []),
      *RubyLens::Model::RailsFrameworkReference::FRAMEWORK_GEMS.map do |name|
        Package.new(name:, version: "8.1.1", files: ["lib/#{name}.rb"])
      end,
      Package.new(name: "rack", version: "3.2.0", files: ["lib/rack.rb"]),
    ]
  end
end
