# frozen_string_literal: true

require_relative "../errors"

module RubyLens
  module Clip
    # Locates the two external tools clip rendering needs: a Chrome/Chromium
    # binary and ffmpeg. Environment overrides win, then PATH, then well-known
    # install locations. Discovery failures raise with install guidance so the
    # command fails fast, before any indexing work.
    module Toolchain
      CHROME_ENV = "RUBYLENS_CHROME"
      FFMPEG_ENV = "RUBYLENS_FFMPEG"
      CHROME_COMMANDS = %w[google-chrome google-chrome-stable chromium chromium-browser chrome].freeze
      CHROME_KNOWN_PATHS = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      ].freeze
      PLAYWRIGHT_CHROME_GLOBS = %w[
        chromium
        chromium-*/chrome-linux/chrome
        chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium
      ].freeze

      module_function

      def chrome_path
        from_environment(CHROME_ENV) ||
          from_path(CHROME_COMMANDS) ||
          from_known_paths(CHROME_KNOWN_PATHS + playwright_chrome_candidates) ||
          raise(Error, "clip rendering needs Chrome or Chromium; install Google Chrome, " \
                       "or point #{CHROME_ENV} at a Chrome-compatible browser binary")
      end

      def ffmpeg_path
        from_environment(FFMPEG_ENV) ||
          from_path(%w[ffmpeg]) ||
          raise(Error, "clip rendering needs ffmpeg; install it (for example `brew install ffmpeg` " \
                       "or `apt install ffmpeg`), or point #{FFMPEG_ENV} at an ffmpeg binary")
      end

      def from_environment(name)
        value = ENV.fetch(name, nil)
        return nil if value.nil? || value.empty?
        raise Error, "#{name} is set to #{value}, which is not an executable file" unless executable?(value)

        value
      end

      def from_path(commands)
        directories = ENV.fetch("PATH", "").split(File::PATH_SEPARATOR)
        commands.each do |command|
          directories.each do |directory|
            next if directory.empty?

            candidate = File.join(directory, command)
            return candidate if executable?(candidate)
          end
        end
        nil
      end

      def from_known_paths(paths)
        paths.find { |path| executable?(path) }
      end

      def playwright_chrome_candidates
        root = ENV.fetch("PLAYWRIGHT_BROWSERS_PATH", nil)
        root = File.expand_path("~/.cache/ms-playwright") if root.nil? || root.empty?
        PLAYWRIGHT_CHROME_GLOBS.flat_map { |pattern| Dir.glob(File.join(root, pattern)) }.sort
      rescue ArgumentError
        # File.expand_path("~") raises when HOME is unset.
        []
      end

      def executable?(path)
        File.file?(path) && File.executable?(path)
      end
    end
  end
end
