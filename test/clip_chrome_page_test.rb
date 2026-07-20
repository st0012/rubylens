# frozen_string_literal: true

require_relative "test_helper"

class ClipChromePageTest < Minitest::Test
  def test_startup_failure_terminates_chrome_and_removes_the_profile
    with_fake_chrome("#!/bin/sh\nexit 0\n") do |fake|
      before = clip_profiles

      error = assert_raises(RubyLens::Error) do
        RubyLens::Clip::ChromePage.new(executable: fake, url: "about:blank", width: 320, height: 200)
      end

      assert_includes(error.message, "Chrome exited while starting up")
      assert_equal(before, clip_profiles)
    end
  end

  def test_missing_executable_cleans_up_and_names_the_binary
    before = clip_profiles

    error = assert_raises(RubyLens::Error) do
      RubyLens::Clip::ChromePage.new(executable: "/nonexistent/chrome", url: "about:blank", width: 320, height: 200)
    end

    assert_includes(error.message, "could not launch Chrome at /nonexistent/chrome")
    assert_equal(before, clip_profiles)
  end

  private

  def with_fake_chrome(script)
    Dir.mktmpdir("rubylens-fake-chrome-") do |directory|
      fake = File.join(directory, "chrome")
      File.write(fake, script)
      File.chmod(0o755, fake)
      yield fake
    end
  end

  def clip_profiles
    Dir.glob(File.join(Dir.tmpdir, "rubylens-clip-*")).sort
  end
end
