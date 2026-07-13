RSpec.describe Service do
  context "when the café is open" do
    it "serves the order" do
      Service.call
    end

    specify "records the receipt" do
      Service.receipt
    end
  end

  describe "pending behavior" do
    it "will be implemented"

    shared_examples "private shared behavior" do
      it "still contributes a raw method reference" do
      end
    end

    before do
      it "still contributes a raw method reference inside a hook" do
      end
    end

    before_all do
      it "still contributes a raw method reference inside a suite hook" do
      end
    end

    lambda do
      it "still contributes a raw method reference inside a lambda" do
      end
    end

    class << self
      describe "raw group reference inside a singleton class" do
        it "still contributes a raw method reference" do
        end
      end
    end

    helper.describe "raw receiver group reference" do
      it "still contributes a raw method reference" do
      end
    end
  end
end

RSpec::Core::Example.describe "not an RSpec group" do
  it "does not become an example" do
  end
end

def helper_definition
  describe "raw group reference inside a method" do
    it "still contributes a raw method reference" do
    end
  end
end
