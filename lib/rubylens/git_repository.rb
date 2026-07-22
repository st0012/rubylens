# frozen_string_literal: true

require "open3"
require "pathname"
require "fileutils"

module RubyLens
  class GitRepository
    attr_reader :target_root, :git_root

    def initialize(target_root)
      @target_root = Pathname(target_root).expand_path.realpath
      raise GitError, "target is not a directory" unless @target_root.directory?

      top, status = capture("rev-parse", "--show-toplevel")
      raise GitError, "target must be inside a Git repository" unless status.success?

      @git_root = Pathname(top.strip).realpath
      unless Paths.inside?(@target_root, @git_root)
        raise GitError, "target is outside its reported Git repository"
      end
    end

    def selected_files
      arguments = ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]
      unless @target_root == @git_root
        relative_target = @target_root.relative_path_from(@git_root)
        arguments.concat(["--", ":(literal)#{relative_target}"])
      end
      output, status = capture(*arguments)
      raise GitError, "failed to enumerate tracked and unignored files" unless status.success?

      git_root = @git_root.to_s
      target_root = @target_root.to_s
      output.split("\0").filter_map do |relative_to_git|
        next unless INDEXABLE_EXTENSIONS.include?(File.extname(relative_to_git))

        absolute = File.join(git_root, relative_to_git)
        next unless File.file?(absolute)
        resolved = File.realpath(absolute)
        next unless Paths.inside?(resolved, target_root)

        resolved
      rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP
        nil
      end.sort
    end

    def exclude_local(path, description: "report")
      path = Pathname(path).expand_path
      path = path.dirname.realpath.join(path.basename)
      raise GitError, "local exclude path is outside the Git repository" unless Paths.inside?(path, @git_root)

      exclude_output, status = capture("rev-parse", "--git-path", "info/exclude")
      raise GitError, "failed to locate Git's local exclude file" unless status.success?

      exclude_path = Pathname(exclude_output.strip)
      exclude_path = @git_root.join(exclude_path) unless exclude_path.absolute?
      FileUtils.mkdir_p(exclude_path.dirname)
      relative = path.relative_path_from(@git_root).to_s
      _tracked_output, tracked_status = capture("ls-files", "--error-unmatch", "--", relative)
      raise GitError, "default #{description} path is already tracked by Git" if tracked_status.success?

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
