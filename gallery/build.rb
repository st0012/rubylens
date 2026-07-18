#!/usr/bin/env ruby
# frozen_string_literal: true

# Generates the publishable Ruby Galaxies folder into gallery/dist.
#
# Run from the repository root with the pinned development Ruby:
#   ruby gallery/build.rb
#
# The script does not clone target projects or install their bundles; it
# verifies each checkout and reports exactly what is missing instead.

require "fileutils"
require "json"
require "open3"

ROOT = File.expand_path("..", __dir__)
DIST = File.join(ROOT, "gallery", "dist")

PROJECTS = {
  "rubocop" => File.expand_path("~/projects/rubocop"),
  "rails" => File.expand_path("~/projects/rails"),
  "discourse" => File.expand_path("~/projects/discourse"),
  "rubygems-org" => File.expand_path("~/projects/rubygems.org"),
}.freeze

# Dependency warnings that are expected and unavoidable for a project (e.g.
# license-gated commercial gems that cannot be installed). Any warning not
# matched here marks the project as failed: the artifact would silently miss
# dependency clouds and report wrong package counts. Patterns pin the exact
# skip reason so the same gems failing differently still fail the build.
EXPECTED_WARNINGS = {
  "rubygems-org" => [
    /\ASkipped avo-[a-z_]+ [\w.]+: exact installed gem not found\.\z/,
    /\ASkipped ransack [\w.]+: exact installed gem not found\.\z/,
  ].freeze,
}.freeze

# RubyLens supports exactly the Rubydex version pinned in the gemspec; outside
# Bundler, `require "rubydex"` would activate whatever version GEM_PATH finds.
RUBYDEX_REQUIREMENT =
  File.read(File.join(ROOT, "rubylens.gemspec"))[/add_dependency "rubydex", "([^"]+)"/, 1] ||
  abort("could not read the rubydex pin from rubylens.gemspec")

# Bundler would restrict gem resolution to rubylens' own lockfile and silently
# skip every target gem, so rubylens runs without it. Targets bundled under a
# different Ruby (e.g. Discourse under 3.4) need their gem dirs on GEM_PATH.
def augmented_gem_path
  candidates = Dir[File.expand_path("~/.gem/ruby/*")] +
               Dir[File.expand_path("~/.rubies/*/lib/ruby/gems/*")]
  ([ENV["GEM_PATH"]] + candidates).compact.reject(&:empty?).uniq.join(":")
end

def run_rubylens(command, target, output, extra)
  # Clear every Bundler variable so the child stays unbundled even when
  # build.rb itself was launched under `bundle exec`. A fixed key list is not
  # enough: RubyGems auto-requires $BUNDLER_SETUP at startup, which would
  # re-bundlerize the child and hide every target gem.
  env = ENV.keys.grep(/\A(BUNDLE_|BUNDLER_)/).to_h { |key| [key, nil] }
  env.merge!(
    "RUBYOPT" => nil, "RUBYLIB" => nil,
    "GEM_PATH" => augmented_gem_path,
    "LC_ALL" => "en_US.UTF-8",
  )
  bootstrap = "gem 'rubydex', '#{RUBYDEX_REQUIREMENT}'; load '#{File.join(ROOT, "exe", "rubylens")}'"
  cmd = ["ruby", "-I#{File.join(ROOT, "lib")}", "-e", bootstrap, "--",
         command, *extra, "-o", output, target]
  stdout, stderr, status = Open3.capture3(env, *cmd)
  [status.success?, stdout, stderr]
end

# Matches MORPHOLOGY_FAMILY in assets/runtime/report.js.
FAMILY_NAMES = ["elliptical", "lenticular", "spiral", "barred spiral", "irregular"].freeze

# The artifact embeds its model as base64 JSON; the project morphology is either
# a hash with a numeric "family" (Explorer art model) or a numeric row whose
# first element is the family index (Showcase model).
def morphology_family(output)
  encoded = File.read(output, encoding: "UTF-8")[/atob\("([^"]+)"\)/, 1]
  return nil unless encoded

  morphology = JSON.parse(encoded.unpack1("m0"))["morphology"]
  index = morphology.is_a?(Hash) ? morphology["family"] : Array(morphology).first
  FAMILY_NAMES[index] if index.is_a?(Integer)
rescue JSON::ParserError, ArgumentError
  nil
end

# The page's per-project facts are hand-maintained; fail the build when they
# drift from the freshly generated artifacts instead of publishing stale copy.
def index_fact_mismatches(index_path, facts)
  html = File.read(index_path, encoding: "UTF-8")
  facts.flat_map do |slug, expected|
    section = html[/<section id="#{Regexp.escape(slug)}".*?<\/section>/m]
    next ["#{slug}: no <section id=\"#{slug}\"> in index.html"] unless section

    mismatches = []
    packages = section[/packages <b>(\d+)<\/b>/, 1]
    unless packages && Integer(packages) == expected.fetch(:packages)
      mismatches << "#{slug}: index.html says packages #{packages.inspect}, artifacts say #{expected.fetch(:packages)}"
    end
    designation = section[/<span class="designation">([^<]+)<\/span>/, 1]
    unless designation == expected.fetch(:family)
      mismatches << "#{slug}: index.html designation #{designation.inspect}, artifacts say #{expected.fetch(:family).inspect}"
    end
    mismatches
  end
end

failures = []
facts = {}
FileUtils.mkdir_p(DIST)
# Explicit directory mode: under a restrictive umask mkdir_p would create
# 0700, and mode-preserving deploys of dist/ would 403 on traversal.
File.chmod(0o755, DIST)

PROJECTS.each do |slug, path|
  unless File.directory?(path)
    failures << slug
    warn "#{slug}: missing checkout at #{path} — clone it and run `bundle install` there first"
    next
  end
  unless File.exist?(File.join(path, "Gemfile.lock"))
    failures << slug
    warn "#{slug}: #{path} has no Gemfile.lock — run `bundle install` there first"
    next
  end

  {
    "report" => [File.join(DIST, "#{slug}.html"), []],
    "showcase" => [File.join(DIST, "#{slug}-showcase.html"), ["--details"]],
  }.each do |command, (output, extra)|
    FileUtils.rm_f(output)
    ok, stdout, stderr = run_rubylens(command, path, output, extra)
    unless ok && File.exist?(output)
      failures << slug
      warn "#{slug} #{command}: FAILED\n#{stdout}#{stderr}"
      next
    end
    json_line = stdout.lines.find { |line| line.start_with?("{") }
    info = json_line ? JSON.parse(json_line) : {}
    warnings = Array(info["warnings"])
    unexpected = warnings.reject do |warning|
      Array(EXPECTED_WARNINGS[slug]).any? { |pattern| pattern.match?(warning) }
    end
    unless unexpected.empty?
      failures << slug
      warn "#{slug} #{command}: FAILED — artifact has unexpected dependency gaps:"
      unexpected.each { |warning| warn "  #{warning}" }
      next
    end
    # RubyLens writes outputs owner-only (0600); the gallery artifacts are for
    # publishing, so make them world-readable for mode-preserving deploys.
    File.chmod(0o644, output)
    family = morphology_family(output)
    facts[slug] = { packages: Integer(info.dig("counts", "packages")), family: family } if command == "report"
    puts "#{slug} #{command}: counts=#{info["counts"].inspect} morphology=#{family} " \
         "warnings=#{warnings.length}"
    warnings.each { |warning| puts "  expected warning: #{warning}" }
  end
end

index = File.join(ROOT, "gallery", "index.html")
if File.exist?(index)
  mismatches = index_fact_mismatches(index, facts)
  if mismatches.empty?
    FileUtils.cp(index, File.join(DIST, "index.html"))
    File.chmod(0o644, File.join(DIST, "index.html"))
  else
    failures << "index"
    warn "index.html facts are stale — update the hand-written rows:"
    mismatches.each { |mismatch| warn "  #{mismatch}" }
  end
else
  puts "note: gallery/index.html does not exist yet; dist has artifacts only"
end
puts "dist ready: #{DIST}"

unless failures.empty?
  warn "FAILED projects: #{failures.uniq.join(", ")}"
  exit 1
end
