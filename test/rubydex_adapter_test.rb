# frozen_string_literal: true

require_relative "test_helper"

class RubydexAdapterTest < Minitest::Test
  include SnapshotHelpers

  def test_real_adapter_returns_only_anonymous_visual_signals
    manifest = RubyLens::Index::Manifest.build(root: FIXTURE)
    snapshot = RubyLens::Index::RubydexAdapter.new.index(manifest)
    serialized = JSON.generate(snapshot)

    assert_equal("rubylens.snapshot.v1", snapshot.fetch("schema"))
    assert_equal(9, snapshot.fetch("namespaces").length)
    assert_equal(9, snapshot.fetch("components").sum)
    assert(snapshot.fetch("namespaces").all? { |row| row.length == 9 && row.all?(Integer) })
    refute_includes(serialized, "Demo")
    refute_includes(serialized, FIXTURE.to_s)
    refute_includes(serialized, "domain.rb")
  end
end
