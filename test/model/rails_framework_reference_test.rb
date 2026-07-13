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
    assert_equal("full_family", result.fetch("scope"))
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

  def test_builds_only_the_exact_installed_footprint_without_a_meta_gem
    members = %w[actionmailer actionpack actionview activejob activemodel activerecord activesupport railties]
    locked = RubyLens::Index::Manifest::RailsReference.new(
      version: "8.0.5", members:, scope: "installed_footprint",
    )
    packages = members.map { |name| Package.new(name:, version: "8.0.5", files: ["lib/#{name}.rb"]) }
    packages << Package.new(name: "rack", version: "3.2.0", files: ["lib/rack.rb"])
    reference = RubyLens::Model::RailsFrameworkReference.new(Manifest.new(rails_reference: locked, packages:))
    reference.add_namespace(0)
    reference.add_namespace(1)

    result = reference.build(index_complete: true, integrity_complete: true)

    assert_equal("installed_footprint", result.fetch("scope"))
    assert_equal(members, result.fetch("members"))
    assert_equal(members, result.fetch("available_members"))
    assert_equal([8, 8], result.fetch("coverage"))
    assert_equal("ready_footprint", result.fetch("status"))
    assert_equal(true, result.fetch("comparable"))
    assert_equal([1, 1], result.fetch("ruby_counts"))
    assert_nil(result.fetch("package_index"))
    assert((0...8).all? { |index| reference.family_package_index?(index) })
    refute(reference.family_package_index?(8), "unrelated dependencies must not enter the footprint")
  end

  def test_suppresses_a_footprint_when_an_expected_locked_member_was_not_indexed
    members = %w[actionpack activesupport railties]
    locked = RubyLens::Index::Manifest::RailsReference.new(
      version: "8.0.5", members:, scope: "installed_footprint",
    )
    packages = members.map { |name| Package.new(name:, version: "8.0.5", files: ["lib/#{name}.rb"]) }
    packages[1] = Package.new(name: "activesupport", version: "8.0.5", files: [])
    reference = RubyLens::Model::RailsFrameworkReference.new(Manifest.new(rails_reference: locked, packages:))
    reference.add_namespace(0)

    result = reference.build(index_complete: true, integrity_complete: true)

    assert_equal([2, 3], result.fetch("coverage"))
    assert_equal("partial_footprint", result.fetch("status"))
    assert_equal(false, result.fetch("comparable"))
    assert_empty(result.fetch("ruby_counts"))
  end

  def test_rejects_an_unrecognized_rails_family_shape
    locked = RubyLens::Index::Manifest::RailsReference.new(
      version: "8.1.1",
      members: RubyLens::Model::RailsFrameworkReference::FRAMEWORK_GEMS.drop(1),
      scope: "full_family",
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
      members: RubyLens::Model::RailsFrameworkReference::FRAMEWORK_GEMS,
      scope: "full_family",
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
