package node

import (
	"crypto/sha256"
	"fmt"
	"slices"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// A long excluded list is paged under the client frame limit, every page but the last with more,
// the reasons in the first page only.
func TestExcludedPages(t *testing.T) {
	var keys []string
	for i := range 3000 {
		h := sha256.Sum256([]byte(fmt.Sprint(i)))
		keys = append(keys, fed.Encode(h[:]))
	}
	slices.Sort(keys)
	p := &exclPager{keys: keys, reasons: []string{"spam"}}
	s := &session{}
	s.excl = p
	var got []string
	for i := 0; ; i++ {
		f, done := p.next(nil, s)
		if s.excl != nil {
			t.Fatal("a started answer is still open to updates")
		}
		if n := len(canon.Encode(f)); n > fed.ClientFrame {
			t.Fatalf("page %d is %d bytes", i, n)
		}
		if _, has := f["reasons"]; has != (i == 0) {
			t.Fatalf("page %d: reasons %v", i, f["reasons"])
		}
		if f["more"] != !done {
			t.Fatalf("page %d: more %v, done %v", i, f["more"], done)
		}
		for _, k := range f["keys"].([]any) {
			got = append(got, k.(string))
		}
		if done {
			if i == 0 {
				t.Fatal("3000 keys in one page")
			}
			break
		}
	}
	if !slices.Equal(got, keys) {
		t.Fatalf("got %d keys back, want %d", len(got), len(keys))
	}
	// Nothing excluded: one page with an empty list.
	f, done := (&exclPager{}).next(nil, s)
	if !done || len(f["keys"].([]any)) != 0 || f["more"] != false {
		t.Fatalf("empty list: %v", f)
	}
}
