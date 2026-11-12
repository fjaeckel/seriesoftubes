package node

// SetCatalogLimits lowers the catalog bounds for a test; the returned func restores them.
func SetCatalogLimits(total, via int) func() {
	t, v := maxCatalog, maxCatalogVia
	maxCatalog, maxCatalogVia = total, via
	return func() { maxCatalog, maxCatalogVia = t, v }
}
