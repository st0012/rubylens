# frozen_string_literal: true

require_relative "../test_helper"

class GitPackageSourceTest < Minitest::Test
  include SnapshotHelpers

  STORE_OBJECT = "/nix/store/00000000000000000000000000000000-example"

  # A checkout resolving outside the bundle is only trusted when it lands in an
  # immutable, content-addressed store object. These shapes pin what counts as
  # one, because widening the pattern silently widens what RubyLens will index.
  def test_store_policy_accepts_only_well_formed_store_objects
    provider = RubyLens::Index::GitPackageSource::NixStoreProvider.new

    assert(provider.trusted?(Pathname(STORE_OBJECT)))
    assert(provider.trusted?(Pathname("#{STORE_OBJECT}/lib")))
    assert(provider.trusted?(Pathname("#{STORE_OBJECT}/lib/nested/deep.rb")))
    assert(provider.trusted?(Pathname("/nix/store/0123456789abcdfghijklmnpqrsvwxyz-name-1.0.0")))

    refute(provider.trusted?(Pathname(File::SEPARATOR)))
    refute(provider.trusted?(Pathname("/nix")))
    refute(provider.trusted?(Pathname("/nix/store")))
    # The store root itself is not an object, and neither is a bare hash.
    refute(provider.trusted?(Pathname("/nix/store/00000000000000000000000000000000")))
    refute(provider.trusted?(Pathname("/nix/store/00000000000000000000000000000000-")))
    # Hashes are exactly 32 characters from Nix's base32 alphabet, which omits
    # "e", "o", "u", and "t" and never uses uppercase.
    refute(provider.trusted?(Pathname("/nix/store/0000000000000000000000000000000-example")))
    refute(provider.trusted?(Pathname("/nix/store/000000000000000000000000000000000-example")))
    ["e", "o", "u", "t", "A"].each do |character|
      refute(
        provider.trusted?(Pathname("/nix/store/000000000000000000000000000000#{character}0-example")),
        "#{character.inspect} is not in the store hash alphabet",
      )
    end
    # Lookalike roots and traversal must not reach the trusted branch.
    refute(provider.trusted?(Pathname("/tmp#{STORE_OBJECT}")))
    refute(provider.trusted?(Pathname("/nix/store2/00000000000000000000000000000000-example")))
    refute(provider.trusted?(Pathname("/nix/store/../etc/passwd")))
    refute(provider.trusted?(Pathname("#{STORE_OBJECT}/../../etc")))
  end

  def test_skips_a_git_dependency_that_still_requires_network_access
    locked = Struct.new(:source).new(Struct.new(:allow_git_ops?).new(true))

    assert_equal(
      :local_only_required,
      RubyLens::Index::GitPackageSource.new(lockfile: Pathname("/tmp/Gemfile.lock")).resolve(locked),
    )
  end

  def test_skips_a_git_dependency_whose_checkout_is_absent
    source = Object.new
    source.define_singleton_method(:allow_git_ops?) { false }
    source.define_singleton_method(:extension_dir_name) { "absent-0123456789ab" }
    source.define_singleton_method(:specs) { raise "checkout must not be read" }
    locked = Struct.new(:source).new(source)

    Dir.mktmpdir("rubylens-git-source-") do |directory|
      assert_equal(
        :checkout_unavailable,
        RubyLens::Index::GitPackageSource.new(lockfile: Pathname(directory).join("Gemfile.lock")).resolve(locked),
      )
    end
  end
end
