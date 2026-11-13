package relaytest

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// FolderSpec describes a data folder of a busy server, for memory and load measurements.
type FolderSpec struct {
	Nets   int   // networks
	Every  int64 // seconds between one network's stats records (300: every slot)
	Hours  int64 // how far back the stats go (72: what a relay keeps)
	Now    int64 // the time the folder is "as of"
	Offers int   // sealed offers per network over the last 30 days, each answered
	Anns   int   // announces per network, one a day back from Now
}

// Folder writes a data folder in the store's day-file format (one line per record: rec, its
// receipts, board slot), as if a relay of server "srv" had received everything from clients.
// Stats look like the load test's: a few POPs, traffic with four others, transit in groups of
// ten. It returns the records written by kind.
func Folder(dir string, f FolderSpec) (map[string]int, error) {
	node := Key("folder node")
	srv := fed.Hash([]byte("folder server"))
	keys := make([]*fed.Signer, f.Nets)
	for i := range keys {
		keys[i] = Key(fmt.Sprint("folder net ", i))
	}
	type line struct {
		day  int64
		kind string
		b    []byte
	}
	lines := make([][]line, f.Nets)
	cities := []string{"ams", "fra", "lon", "par", "nyc", "sjc", "sin", "tyo", "syd", "gru"}
	var wg sync.WaitGroup
	work := make(chan int)
	for range runtime.GOMAXPROCS(0) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range work {
				k := keys[i]
				add := func(rec map[string]any, at int64) {
					r, code := fed.CheckValue(rec, at, fed.Opts{})
					if code != "" {
						panic(code)
					}
					rc := node.MakeReceipt(r, srv, at, "DE")
					b := canon.Encode(map[string]any{"rec": canon.Raw(r.Canon()), "rcpt": []any{rc}, "slot": fed.Slot(at)})
					lines[i] = append(lines[i], line{fed.Div(at, fed.Day), r.Kind, append(b, '\n')})
				}
				for a := f.Anns - 1; a >= 0; a-- {
					t := f.Now - int64(a)*fed.Day - int64(i%600)
					asn, _ := fed.ASN(k.Key)
					add(k.Seal("announce", t, map[string]any{"name": fmt.Sprint("Folder Net ", i), "asn": asn, "box": k.Key,
						"home": []string{"DE", "FR", "US", "JP"}[i%4], "day": int64(100 + a), "founded": t/86400 - int64(10+i%90),
						"pops": []any{cities[i%10], cities[(i+3)%10], cities[(i+7)%10]}, "ix": []any{cities[i%10]}, "cust": int64(i % 50),
						"mix":     map[string]any{"content": int64(200), "eyeball": int64(700), "enterprise": int64(100)},
						"traffic": map[string]any{"in": int64(1000 + i), "out": int64(500 + i)}, "policy": "open", "rates": map[string]any{},
						"auto": map[string]any{"peering": "auto", "transit": "review", "pni": "review", "swap": "decline", "consortium": "decline", "port": "decline"}}), t)
				}
				start := f.Now - f.Hours*3600 + int64(i*7)%f.Every
				for t := start; t <= f.Now; t += f.Every {
					var tr []any
					for j := 1; j <= 4 && j < f.Nets; j++ {
						o := keys[(i+j*37)%f.Nets]
						tr = append(tr, map[string]any{"key": o.Key, "in": 100 + (t/7+int64(j))%5000, "out": 100 + (t/11+int64(j))%5000})
					}
					if tr == nil {
						tr = []any{}
					}
					body := map[string]any{"mode": "normal", "pops": map[string]any{cities[i%10]: int64(1), cities[(i+3)%10]: int64(2), cities[(i+7)%10]: int64(1)},
						"traffic": tr, "total": 1000 + t%100000, "tier1": i%50 == 0, "shareCountry": true, "pies": int64(i % 7)}
					if g := i - i%10; i%10 == 0 {
						var cust []any
						for j := g + 1; j < g+10 && j < f.Nets; j++ {
							cust = append(cust, keys[j].Key)
						}
						if cust != nil {
							body["cust"] = cust
						}
					} else {
						body["up"] = []any{keys[g].Key}
					}
					add(k.Seal("stats", t, body), t)
				}
				for o := range f.Offers {
					t := f.Now - int64(o+1)*30*fed.Day/int64(f.Offers+1) - int64(i%600)
					to := keys[(i+1+o)%f.Nets]
					off := k.Seal("offer", t, map[string]any{"to": to.Key, "enc": Enc(t, 200)})
					add(off, t)
					id, _ := fed.CheckValue(off, t, fed.Opts{Trusted: true})
					add(to.Seal("accept", t+60, map[string]any{"offer": id.ID, "to": k.Key}), t+60)
				}
			}
		}()
	}
	for i := range f.Nets {
		work <- i
	}
	close(work)
	wg.Wait()
	if err := os.MkdirAll(filepath.Join(dir, "log"), 0o700); err != nil {
		return nil, err
	}
	files := map[int64]*bufio.Writer{}
	var open []*os.File
	n := map[string]int{}
	// Interleave networks the way they arrive: round-robin over each network's records.
	for pos := 0; ; pos++ {
		any := false
		for i := range lines {
			if pos >= len(lines[i]) {
				continue
			}
			any = true
			l := lines[i][pos]
			w := files[l.day]
			if w == nil {
				fh, err := os.Create(filepath.Join(dir, "log", fmt.Sprint(l.day, ".jsonl")))
				if err != nil {
					return nil, err
				}
				open = append(open, fh)
				w = bufio.NewWriterSize(fh, 1<<20)
				files[l.day] = w
			}
			w.Write(l.b)
			n[l.kind]++
		}
		if !any {
			break
		}
	}
	for _, w := range files {
		if err := w.Flush(); err != nil {
			return nil, err
		}
	}
	for _, fh := range open {
		fh.Close()
	}
	return n, os.WriteFile(filepath.Join(dir, "VERSION"), []byte("{\"v\":1}\n"), 0o600)
}
