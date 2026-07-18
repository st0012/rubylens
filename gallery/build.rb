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
require "rbconfig"

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
  File.read(File.join(ROOT, "rubylens.gemspec"), encoding: "UTF-8")[/add_dependency "rubydex", "([^"]+)"/, 1] ||
  abort("could not read the rubydex pin from rubylens.gemspec")

# Bundler would restrict gem resolution to rubylens' own lockfile and silently
# skip every target gem, so rubylens runs without it. Targets bundled under a
# different Ruby (e.g. Discourse under 3.4) need their gem dirs on GEM_PATH.
def augmented_gem_path
  # Start from this interpreter's own gem search path (defaults included) so
  # setting GEM_PATH in the child never drops directories RubyGems would have
  # used anyway; then add cross-Ruby candidates for targets bundled elsewhere.
  candidates = Gem.path +
               Dir[File.expand_path("~/.gem/ruby/*")] +
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
  )
  bootstrap = "gem 'rubydex', '#{RUBYDEX_REQUIREMENT}'; load '#{File.join(ROOT, "exe", "rubylens")}'"
  # RbConfig.ruby: the child must run under the same interpreter as this
  # script, not whatever `ruby` PATH resolves to. -EUTF-8: the runtime assets
  # contain UTF-8; force the default external encoding instead of depending
  # on a locale that may not exist on the host.
  cmd = [RbConfig.ruby, "-EUTF-8", "-I#{File.join(ROOT, "lib")}", "-e", bootstrap, "--",
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

# Social cards need a broadly supported raster format. Reject a regenerated
# card with the wrong dimensions, bit depth, or alpha channel before it
# enters the publishable folder.
def png_properties(path)
  header = File.binread(path, 26)
  signature = "\x89PNG\r\n\x1a\n".b
  return unless header.start_with?(signature) && header.byteslice(12, 4) == "IHDR"

  width, height = header.byteslice(16, 8).unpack("NN")
  [width, height, header.getbyte(24), header.getbyte(25)]
rescue SystemCallError
  nil
end

# Matches RubyLens::INDEXABLE_EXTENSIONS: the file types that can enter the
# index manifest and therefore leak into published artifacts.
INDEXABLE_EXTENSIONS = %w[.rb .rake .rbs .ru].freeze

# The gallery publishes artifacts, so target checkouts must not contribute
# unofficial sources: any tracked change fails, and untracked files fail when
# they could enter the index manifest. Untracked junk (.DS_Store etc.) passes.
def dirty_entries(path)
  # -z: NUL-delimited raw paths, so quoted/non-ASCII names can't slip past the
  # extension check the way core.quotePath-mangled porcelain lines could.
  out, _err, status = Open3.capture3("git", "-C", path, "status", "--porcelain", "-z", "-uall")
  return ["git status failed for #{path}"] unless status.success?

  entries = []
  # Git emits raw path bytes; treat them as binary so non-ASCII names can't
  # crash parsing under an ASCII default encoding.
  tokens = out.force_encoding(Encoding::BINARY).split("\0")
  until tokens.empty?
    entry = tokens.shift
    next if entry.nil? || entry.length < 3

    state = entry[0, 2]
    file = entry[3..]
    tokens.shift if state.start_with?("R", "C") # rename/copy carries an origin path token
    if state == "??"
      entries << "?? #{file}" if INDEXABLE_EXTENSIONS.include?(File.extname(file))
    else
      entries << "#{state} #{file}"
    end
  end
  entries
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
  dirty = dirty_entries(path)
  unless dirty.empty?
    failures << slug
    warn "#{slug}: checkout at #{path} is not clean — the gallery publishes only official sources:"
    dirty.first(10).each { |line| warn "  #{line}" }
    next
  end
  unless Open3.capture3("git", "-C", path, "ls-files", "--error-unmatch", "Gemfile.lock")[2].success?
    warn "#{slug}: note — Gemfile.lock is not tracked upstream, so dependency clouds " \
         "reflect this machine's bundle resolution of the official Gemfile"
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

social = File.join(ROOT, "gallery", "social-preview.png")
if png_properties(social) == [1200, 630, 8, 2]
  FileUtils.cp(social, File.join(DIST, "social-preview.png"))
  File.chmod(0o644, File.join(DIST, "social-preview.png"))
else
  failures << "social-preview"
  warn "#{social}: expected a 1200x630 8-bit RGB PNG (regenerate with `node gallery/social_preview.mjs`)"
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
