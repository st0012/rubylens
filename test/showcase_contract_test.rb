# frozen_string_literal: true

require_relative "test_helper"

# Frontend contracts — runtime, shells, and stylesheets — live in the vitest
# suite (test/js/). Ruby pins only the Ruby-side constants that must stay in
# step with them.
class ShowcaseContractTest < Minitest::Test
  def test_annotation_limit_matches_the_runtime_preset_pin
    # The JS side pins SHOWCASE_ANNOTATION_PRESET.limit to the same number in
    # test/js/showcase_contract.test.mjs; each side asserts it independently.
    assert_equal(200, RubyLens::ShowcaseModel::ANNOTATION_LIMIT)
  end
end
