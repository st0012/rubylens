# frozen_string_literal: true

require_relative "test_helper"

class MCPProbeTest < Minitest::Test
  def test_sanitizer_covers_unix_windows_and_unc_paths
    probe = RubyLens::MCPProbe.allocate
    probe.instance_variable_set(:@target_root, "/workspace/project")
    text = [
      "/workspace/project/lib/app.rb",
      "/home/alice/private.rb",
      "C:\\Users\\alice\\private.rb",
      "\\\\server\\share\\private.rb",
    ].join(" ")

    sanitized = probe.send(:sanitize_text, text)

    assert_includes(sanitized, "<workspace>")
    assert_equal(3, sanitized.scan("<absolute-path>").length)
    refute_includes(sanitized, "alice")
    refute_includes(sanitized, "server")
  end

  def test_recursive_sanitizer_omits_comments_and_source_fields
    probe = RubyLens::MCPProbe.allocate
    probe.instance_variable_set(:@target_root, "/workspace/project")
    result = probe.send(
      :sanitize_result,
      {
        "name" => "Example",
        "comments" => ["private"],
        "source_excerpt" => "secret",
        "message" => "see /home/alice/private.rb",
      },
    )

    refute(result.key?("comments"))
    refute(result.key?("source_excerpt"))
    assert_equal("see <absolute-path>", result.fetch("message"))
  end
end
