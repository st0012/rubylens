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
# dependency clouds and report wrong package counts.
EXPECTED_WARNINGS = {
  "rubygems-org" => [/\ASkipped avo-/, /\ASkipped ransack /].freeze,
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

failures = []
FileUtils.mkdir_p(DIST)

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
    puts "#{slug} #{command}: counts=#{info["counts"].inspect} morphology=#{family} " \
         "warnings=#{warnings.length}"
    warnings.each { |warning| puts "  expected warning: #{warning}" }
  end
end

index = File.join(ROOT, "gallery", "index.html")
if File.exist?(index)
  FileUtils.cp(index, File.join(DIST, "index.html"))
  File.chmod(0o644, File.join(DIST, "index.html"))
else
  puts "note: gallery/index.html does not exist yet; dist has artifacts only"
end
puts "dist ready: #{DIST}"

unless failures.empty?
  warn "FAILED projects: #{failures.uniq.join(", ")}"
  exit 1
end
