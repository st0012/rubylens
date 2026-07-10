# frozen_string_literal: true

require "fileutils"

module RubyLens
  class OverlayBuilder
    def initialize(target_root:, output_dir:)
      @target_root = File.realpath(target_root)
      @output_dir = File.expand_path(output_dir)
      if Paths.inside?(@output_dir, @target_root)
        raise ExtractionError, "bundle overlay must be outside the target worktree"
      end
    end

    def run
      target_gemfile = File.join(@target_root, "Gemfile")
      target_lockfile = File.join(@target_root, "Gemfile.lock")
      raise ExtractionError, "target has no Gemfile" unless File.file?(target_gemfile)

      FileUtils.mkdir_p(@output_dir)
      base_gemfile = "eval_gemfile #{target_gemfile.dump}\n"
      File.write(File.join(@output_dir, "TargetGemfile"), base_gemfile)
      File.write(
        File.join(@output_dir, "Gemfile"),
        "#{base_gemfile}\ngem \"rubydex\", \"0.2.9\"\n",
      )
      if File.file?(target_lockfile)
        rewritten_lock = rewrite_path_sources(File.read(target_lockfile))
        File.write(File.join(@output_dir, "TargetGemfile.lock"), rewritten_lock)
        File.write(File.join(@output_dir, "Gemfile.lock"), rewritten_lock)
      end
      {
        "gemfile" => File.join(@output_dir, "Gemfile"),
        "lockfile" => File.join(@output_dir, "Gemfile.lock"),
        "target_gemfile" => File.join(@output_dir, "TargetGemfile"),
        "target_lockfile" => File.join(@output_dir, "TargetGemfile.lock"),
      }
    end

    private

    def rewrite_path_sources(contents)
      section = nil
      contents.lines.map do |line|
        section = line.strip if line.match?(/\A[A-Z][A-Z ]*\n?\z/)
        if section == "PATH" && (match = line.match(/\A  remote: (.+)\n?\z/))
          remote = match[1]
          unless remote.start_with?("/", "file:") || remote.match?(/\A[a-z][a-z+.-]*:\/\//i)
            line = "  remote: #{File.expand_path(remote, @target_root)}\n"
          end
        end
        line
      end.join
    end
  end
end
