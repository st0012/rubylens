# frozen_string_literal: true

require_relative "../test_helper"

class LocationIndexTest < Minitest::Test
  include SnapshotHelpers

  def test_non_file_definitions_are_intentionally_ineligible_for_packages
    location = Struct.new(:uri).new("https://example.test/builtin.rbs")
    manifest = stub
    manifest.expects(:package_index_for).never

    assert_nil(RubyLens::Index::LocationIndex.new(manifest).package_index_for(location))
  end

  def test_package_attribution_requires_a_document_rubydex_actually_indexed
    Dir.mktmpdir("rubylens-document-authority-") do |directory|
      indexed = File.join(directory, "indexed.rb")
      absent = File.join(directory, "absent.rb")
      File.write(indexed, "Indexed = 1\n")
      File.write(absent, "Absent = 1\n")
      locations = RubyLens::Index::LocationIndex.new(stub(package_index_for: 3))
      locations.package_document_paths << indexed

      assert_equal(3, locations.package_index_for(Struct.new(:uri).new("file://#{indexed}")))
      assert_nil(locations.package_index_for(Struct.new(:uri).new("file://#{absent}")))
    end
  end

  def test_scope_separates_test_trees_from_core_without_resolving_twice
    manifest = stub(workspace_path?: true)
    manifest.stubs(:relative_workspace_path).with("/workspace/lib/core.rb").returns("lib/core.rb")
    manifest.stubs(:relative_workspace_path).with("/workspace/spec/thing_spec.rb").returns("spec/thing_spec.rb")
    manifest.stubs(:relative_workspace_path).with("/workspace/outside.rb").returns(nil)
    locations = RubyLens::Index::LocationIndex.new(manifest)

    assert_equal(RubyLens::Index::LocationIndex::CORE, locations.scope_for("file:///workspace/lib/core.rb"))
    assert_equal(RubyLens::Index::LocationIndex::TEST, locations.scope_for("file:///workspace/spec/thing_spec.rb"))
    assert_nil(locations.scope_for("file:///workspace/outside.rb"))

    # A second ask must not reach the manifest again.
    manifest.expects(:relative_workspace_path).never
    assert_equal(RubyLens::Index::LocationIndex::CORE, locations.scope_for("file:///workspace/lib/core.rb"))
  end

  def test_unreadable_locations_are_not_workspace_members
    location = stub
    location.stubs(:uri).raises("uri unavailable")

    refute(RubyLens::Index::LocationIndex.new(stub).workspace?(location))
  end
end
