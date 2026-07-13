# frozen_string_literal: true

require "open3"
require "pathname"
require "fileutils"

module RubyLens
  class GitRepository
    INDEXABLE_EXTENSIONS = %w[.rb .rake .rbs .ru].freeze

    attr_reader :target_root, :git_root

    def initialize(target_root)
      @target_root = Pathname(target_root).expand_path.realpath
      raise ExtractionError, "target is not a directory" unless @target_root.directory?

      top, status = capture("rev-parse", "--show-toplevel")
      raise ExtractionError, "target must be inside a Git repository" unless status.success?

      @git_root = Pathname(top.strip).realpath
      unless Paths.inside?(@target_root, @git_root)
        raise ExtractionError, "target is outside its reported Git repository"
      end
    end

    def metadata
      head, head_status = capture("rev-parse", "--verify", "HEAD")
      branch, branch_status = capture("symbolic-ref", "--quiet", "--short", "HEAD")
      status_output, status_status = capture("status", "--porcelain=v1", "--untracked-files=normal")
      raise ExtractionError, "failed to read Git status" unless status_status.success?

      {
        "head" => head_status.success? ? head.strip : nil,
        "branch" => branch_status.success? ? branch.strip : nil,
        "dirty" => !status_output.empty?,
      }
    end

    def selected_files
      output, status = capture("ls-files", "-z", "--cached", "--others", "--exclude-standard")
      raise ExtractionError, "failed to enumerate tracked and unignored files" unless status.success?

      output.split("\0").filter_map do |relative_to_git|
        next unless INDEXABLE_EXTENSIONS.include?(File.extname(relative_to_git))

        absolute = @git_root.join(relative_to_git).cleanpath
        next unless Paths.inside?(absolute, @target_root)
        next unless absolute.file?
        resolved = absolute.realpath
        next unless Paths.inside?(resolved, @target_root.realpath)

        resolved.to_s
      rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP
        nil
      end.sort
    end

    def exclude_local(path, description: "report")
      path = Pathname(path).expand_path
      path = path.dirname.realpath.join(path.basename)
      raise ExtractionError, "local exclude path is outside the Git repository" unless Paths.inside?(path, @git_root)

      exclude_output, status = capture("rev-parse", "--git-path", "info/exclude")
      raise ExtractionError, "failed to locate Git's local exclude file" unless status.success?

      exclude_path = Pathname(exclude_output.strip)
      exclude_path = @git_root.join(exclude_path) unless exclude_path.absolute?
      FileUtils.mkdir_p(exclude_path.dirname)
      relative = path.relative_path_from(@git_root).to_s
      _tracked_output, tracked_status = capture("ls-files", "--error-unmatch", "--", relative)
      raise ExtractionError, "default #{description} path is already tracked by Git" if tracked_status.success?

      directory = File.dirname(relative)
      basename = File.basename(relative)
      escaped_report = escape_ignore_path(relative)
      escaped_temporary = ".#{escape_ignore_path(basename)}.*.tmp"
      escaped_temporary = "#{escape_ignore_path(directory)}/#{escaped_temporary}" unless directory == "."
      entries = ["/#{escaped_report}", "/#{escaped_temporary}"]
      File.open(exclude_path, File::RDWR | File::CREAT, 0o600) do |file|
        file.flock(File::LOCK_EX)
        file.rewind
        contents = file.read
        existing = contents.each_line.map(&:chomp)
        missing = entries - existing
        return false if missing.empty?

        file.seek(0, IO::SEEK_END)
        file.write("\n") if !contents.empty? && !contents.end_with?("\n")
        file.write("#{missing.join("\n")}\n")
      end
      true
    end

    private

    def escape_ignore_path(path)
      path.gsub(/([\\*?\[\]])/, '\\\\\1')
    end

    def capture(*arguments)
      directory = @git_root || @target_root
      stdout, _stderr, status = Open3.capture3("git", "-C", directory.to_s, *arguments)
      [stdout, status]
    end
  end
end
