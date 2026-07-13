# frozen_string_literal: true

require_relative "test_helper"

class GitRepositoryTest < Minitest::Test
  def test_distinguishes_tracked_files_from_untracked_workspace_inputs
    Dir.mktmpdir("rubylens-git-") do |directory|
      system("git", "-C", directory, "init", "--quiet", exception: true)
      File.write(File.join(directory, "tracked.rb"), "TRACKED = true\n")
      File.write(File.join(directory, "untracked.rb"), "UNTRACKED = true\n")
      system("git", "-C", directory, "add", "tracked.rb", exception: true)
      repository = RubyLens::GitRepository.new(directory)
      root = Pathname(directory).realpath

      assert_equal([root.join("tracked.rb").to_s], repository.tracked_files)
      assert_equal(
        [root.join("tracked.rb").to_s, root.join("untracked.rb").to_s],
        repository.selected_files,
      )
    end
  end

  def test_adds_default_report_to_local_git_excludes_once
    Dir.mktmpdir("rubylens-git-") do |directory|
      system("git", "-C", directory, "init", "--quiet", exception: true)
      repository = RubyLens::GitRepository.new(directory)
      report = File.join(directory, RubyLens::Generator::DEFAULT_REPORT_NAME)

      assert(repository.exclude_local(report))
      refute(repository.exclude_local(report))

      entries = File.readlines(File.join(directory, ".git", "info", "exclude"), chomp: true)
      assert_equal(1, entries.count("/rubylens-report.html"))
      assert_equal(1, entries.count("/.rubylens-report.html.*.tmp"))

      File.write(report, "private report")
      temporary = File.join(directory, ".rubylens-report.html.abc123.tmp")
      File.write(temporary, "private temporary report")
      assert(system("git", "-C", directory, "check-ignore", "--quiet", report))
      assert(system("git", "-C", directory, "check-ignore", "--quiet", temporary))
    end
  end

  def test_refuses_to_exclude_a_tracked_default_report
    Dir.mktmpdir("rubylens-git-") do |directory|
      system("git", "-C", directory, "init", "--quiet", exception: true)
      report = File.join(directory, RubyLens::Generator::DEFAULT_REPORT_NAME)
      File.write(report, "tracked report")
      system("git", "-C", directory, "add", RubyLens::Generator::DEFAULT_REPORT_NAME, exception: true)

      error = assert_raises(RubyLens::ExtractionError) do
        RubyLens::GitRepository.new(directory).exclude_local(report)
      end

      assert_equal("default report path is already tracked by Git", error.message)
      refute(system("git", "-C", directory, "check-ignore", "--quiet", report))
    end
  end
end
