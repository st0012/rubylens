# frozen_string_literal: true

require_relative "test_helper"

class GitRepositoryTest < Minitest::Test
  include SnapshotHelpers

  def test_selects_only_tracked_or_unignored_rubydex_file_types
    repository = RubyLens::GitRepository.new(FIXTURE)
    relative_paths = repository.selected_files.map { |path| Pathname(path).relative_path_from(FIXTURE).to_s }

    assert_equal(
      ["config.ru", "lib/domain.rb", "lib/reopen.rb", "sig/domain.rbs", "tasks/demo.rake", "test/order_test.rb"],
      relative_paths,
    )
    refute_includes(relative_paths, "ignored.rb")
  end

  def test_rejects_ruby_symlinks_that_escape_the_target_root
    Dir.mktmpdir("rubylens-git-") do |directory|
      repository_root = File.join(directory, "repo")
      external_root = File.join(directory, "external")
      FileUtils.mkdir_p(repository_root)
      FileUtils.mkdir_p(external_root)
      system("git", "init", "-q", repository_root, exception: true)
      external_file = File.join(external_root, "private.rb")
      File.write(external_file, "PRIVATE_VALUE = 1\n")
      File.symlink(external_file, File.join(repository_root, "leak.rb"))

      selected = RubyLens::GitRepository.new(repository_root).selected_files

      assert_empty(selected)
    end
  end

  def test_selected_files_limits_git_enumeration_to_a_nested_target
    Dir.mktmpdir("rubylens-git-") do |directory|
      target = File.join(directory, "component")
      FileUtils.mkdir_p(target)
      system("git", "-C", directory, "init", "--quiet", exception: true)
      inside = File.join(target, "inside.rb")
      outside = File.join(directory, "outside.rb")
      File.write(inside, "Inside = 1\n")
      File.write(outside, "Outside = 1\n")

      selected = RubyLens::GitRepository.new(target).selected_files

      assert_equal([File.realpath(inside)], selected)
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

      error = assert_raises(RubyLens::GitError) do
        RubyLens::GitRepository.new(directory).exclude_local(report)
      end

      assert_equal("default report path is already tracked by Git", error.message)
      refute(system("git", "-C", directory, "check-ignore", "--quiet", report))
    end
  end
end
