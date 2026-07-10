# frozen_string_literal: true

require_relative "test_helper"

class OverlayBuilderTest < Minitest::Test
  include SnapshotHelpers

  def test_rewrites_relative_path_sources_outside_the_target
    Dir.mktmpdir("rubylens-overlay-") do |directory|
      target = File.join(directory, "target")
      output = File.join(directory, "overlay")
      FileUtils.mkdir_p(File.join(target, "component"))
      File.write(File.join(target, "Gemfile"), "source \"https://rubygems.org\"\n")
      File.write(
        File.join(target, "Gemfile.lock"),
        "PATH\n  remote: component\n  specs:\n\nGEM\n  remote: https://rubygems.org/\n  specs:\n",
      )

      RubyLens::OverlayBuilder.new(target_root: target, output_dir: output).run

      overlay_lock = File.read(File.join(output, "Gemfile.lock"))
      assert_includes(overlay_lock, "remote: #{File.join(File.realpath(target), "component")}")
      assert_includes(overlay_lock, "remote: https://rubygems.org/")
      assert_includes(File.read(File.join(output, "Gemfile")), "gem \"rubydex\", \"0.2.9\"")
      refute_includes(File.read(File.join(output, "TargetGemfile")), "gem \"rubydex\"")
      assert_equal(overlay_lock, File.read(File.join(output, "TargetGemfile.lock")))
    end
  end
end
