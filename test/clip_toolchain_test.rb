# frozen_string_literal: true

require_relative "test_helper"

class ClipToolchainTest < Minitest::Test
  def test_environment_override_wins_when_executable
    with_fake_tool("chrome") do |path|
      ENV["RUBYLENS_CHROME"] = path

      assert_equal(path, RubyLens::Clip::Toolchain.chrome_path)
    ensure
      ENV.delete("RUBYLENS_CHROME")
    end
  end

  def test_environment_override_must_be_executable
    ENV["RUBYLENS_CHROME"] = "/nonexistent/chrome"

    error = assert_raises(RubyLens::Error) { RubyLens::Clip::Toolchain.chrome_path }

    assert_includes(error.message, "RUBYLENS_CHROME is set to /nonexistent/chrome")
  ensure
    ENV.delete("RUBYLENS_CHROME")
  end

  def test_path_discovery_finds_a_browser_command
    with_fake_tool("chromium") do |path|
      with_environment("PATH" => File.dirname(path), "PLAYWRIGHT_BROWSERS_PATH" => "/nonexistent") do
        assert_equal(path, RubyLens::Clip::Toolchain.chrome_path)
      end
    end
  end

  def test_missing_ffmpeg_fails_with_install_guidance
    with_environment("PATH" => "", "RUBYLENS_FFMPEG" => nil) do
      error = assert_raises(RubyLens::Error) { RubyLens::Clip::Toolchain.ffmpeg_path }

      assert_includes(error.message, "needs ffmpeg")
      assert_includes(error.message, "RUBYLENS_FFMPEG")
    end
  end

  def test_missing_chrome_fails_with_install_guidance
    RubyLens::Clip::Toolchain.stubs(:from_known_paths).returns(nil)
    with_environment("PATH" => "", "RUBYLENS_CHROME" => nil) do
      error = assert_raises(RubyLens::Error) { RubyLens::Clip::Toolchain.chrome_path }

      assert_includes(error.message, "needs Chrome or Chromium")
      assert_includes(error.message, "RUBYLENS_CHROME")
    end
  end

  private

  def with_fake_tool(name)
    Dir.mktmpdir("rubylens-toolchain-") do |directory|
      path = File.join(directory, name)
      File.write(path, "#!/bin/sh\n")
      File.chmod(0o755, path)
      yield path
    end
  end

  def with_environment(overrides)
    saved = overrides.keys.to_h { |key| [key, ENV.fetch(key, nil)] }
    overrides.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
    yield
  ensure
    saved.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end
end
