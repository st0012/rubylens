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

ROOT = File.expand_path("..", __dir__)
DIST = File.join(ROOT, "gallery", "dist")

PROJECTS = {
  "rubocop" => File.expand_path("~/projects/rubocop"),
  "rails" => File.expand_path("~/projects/rails"),
  "discourse" => File.expand_path("~/projects/discourse"),
  "rubygems-org" => File.expand_path("~/projects/rubygems.org"),
}.freeze

# Bundler would restrict gem resolution to rubylens' own lockfile and silently
# skip every target gem, so rubylens runs without it. Targets bundled under a
# different Ruby (e.g. Discourse under 3.4) need their gem dirs on GEM_PATH.
def augmented_gem_path
  candidates = Dir[File.expand_path("~/.gem/ruby/*")] +
               Dir[File.expand_path("~/.rubies/*/lib/ruby/gems/*")]
  ([ENV["GEM_PATH"]] + candidates).compact.reject(&:empty?).uniq.join(":")
end

def run_rubylens(command, target, output, extra)
  env = { "GEM_PATH" => augmented_gem_path, "LC_ALL" => "en_US.UTF-8" }
  cmd = ["ruby", "-I#{File.join(ROOT, "lib")}", File.join(ROOT, "exe", "rubylens"),
         command, *extra, "-o", output, target]
  out = IO.popen(env, cmd, err: [:child, :out], &:read)
  [Process.last_status.success?, out]
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
    ok, out = run_rubylens(command, path, output, extra)
    unless ok && File.exist?(output)
      failures << slug
      warn "#{slug} #{command}: FAILED\n#{out}"
      next
    end
    json_line = out.lines.find { |line| line.start_with?("{") }
    info = json_line ? JSON.parse(json_line) : {}
    family = morphology_family(output)
    puts "#{slug} #{command}: counts=#{info["counts"].inspect} morphology=#{family} " \
         "warnings=#{Array(info["warnings"]).length}"
    Array(info["warnings"]).each { |warning| puts "  warning: #{warning}" }
  end
end

index = File.join(ROOT, "gallery", "index.html")
if File.exist?(index)
  FileUtils.cp(index, File.join(DIST, "index.html"))
else
  puts "note: gallery/index.html does not exist yet; dist has artifacts only"
end
puts "dist ready: #{DIST}"

unless failures.empty?
  warn "FAILED projects: #{failures.uniq.join(", ")}"
  exit 1
end
